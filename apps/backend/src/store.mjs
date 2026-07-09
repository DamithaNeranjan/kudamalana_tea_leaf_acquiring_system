import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { makeId } from "../../../packages/shared/src/index.mjs";

function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const hash = createHash("sha256").update(`${salt}:${password}`).digest("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (String(stored || "").startsWith("scrypt$")) {
    const [, salt, hash] = String(stored).split("$");
    if (!salt || !hash) return false;
    const actual = Buffer.from(scryptSync(String(password), salt, 64).toString("hex"), "hex");
    const expected = Buffer.from(hash, "hex");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
  const [salt, expected] = String(stored || "").split(":");
  if (!salt || !expected) return false;
  return hashPassword(password, salt) === stored;
}

export function createMemoryStore() {
  const users = new Map();
  const sessions = new Map();
  const teaLines = new Map();
  const suppliers = new Map();
  const entries = new Map();
  const monthlySettings = new Map();
  const supplierMonthOverrides = new Map();
  const advances = new Map();
  const fertilizerInstallments = new Map();
  const teaPackets = new Map();
  const supplierPayments = new Map();
  const arrears = new Map();
  const syncLog = [];

  const superAdmin = {
    id: "user_superadmin",
    username: "superadmin",
    displayName: "Super Admin",
    role: "super_admin",
    passwordHash: hashPassword("admin123"),
    active: true,
    createdAt: new Date().toISOString()
  };
  users.set(superAdmin.id, superAdmin);
  const admin = {
    id: "user_admin",
    username: "admin",
    displayName: "Admin",
    role: "super_admin",
    passwordHash: hashPassword("admin123"),
    active: true,
    createdAt: new Date().toISOString()
  };
  users.set(admin.id, admin);

  function publicUser(user) {
    const { passwordHash, ...safeUser } = user;
    return safeUser;
  }

  function requireRole(sessionToken, roles) {
    const session = sessions.get(sessionToken);
    if (!session) {
      const error = new Error("Unauthorized");
      error.status = 401;
      throw error;
    }
    const user = users.get(session.userId);
    if (!user || !user.active || !roles.includes(user.role)) {
      const error = new Error("Forbidden");
      error.status = 403;
      throw error;
    }
    return user;
  }

  function upsertMany(map, records) {
    for (const record of records || []) {
      if (!record.id) {
        const error = new Error("Synced records must include ids");
        error.status = 400;
        throw error;
      }
      map.set(record.id, { ...map.get(record.id), ...record });
    }
  }

  function syncedOfficeUsers() {
    return [...users.values()]
      .filter((user) => user.role === "office_user")
      .map((user) => ({
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        passwordHash: user.passwordHash,
        active: Boolean(user.active),
        updatedAt: user.updatedAt || user.createdAt
      }))
      .sort((a, b) => a.username.localeCompare(b.username));
  }

  function upsertOfficeUsers(records = []) {
    for (const record of records) {
      if (record?.role !== "office_user") continue;
      if (!record.id || !record.username || !record.displayName || !record.passwordHash) {
        const error = new Error("Synced office users must include id, username, displayName, and passwordHash");
        error.status = 400;
        throw error;
      }
      const existing = users.get(record.id) || [...users.values()].find((user) => user.username === record.username);
      if (existing && existing.role !== "office_user") continue;
      if (existing?.updatedAt && record.updatedAt && new Date(existing.updatedAt) > new Date(record.updatedAt)) continue;
      const user = {
        id: existing?.id || record.id,
        username: record.username,
        displayName: record.displayName,
        role: "office_user",
        passwordHash: record.passwordHash,
        active: record.active !== false,
        createdAt: existing?.createdAt || record.createdAt || new Date().toISOString(),
        updatedAt: record.updatedAt || new Date().toISOString()
      };
      users.set(user.id, user);
    }
  }

  function assertManagedRole(role) {
    if (!["director", "office_user"].includes(role)) {
      const error = new Error("role must be director or office_user");
      error.status = 400;
      throw error;
    }
  }

  function syncDesktopPayload(actor, payload) {
    upsertOfficeUsers(payload.officeUsers);
    upsertMany(teaLines, payload.teaLines);
    upsertMany(suppliers, payload.suppliers);
    upsertMany(entries, payload.collectionEntries);
    upsertMany(advances, payload.advances);
    upsertMany(fertilizerInstallments, payload.fertilizerInstallments);
    upsertMany(teaPackets, payload.teaPackets);
    upsertMany(supplierPayments, payload.supplierPayments);
    upsertMany(arrears, payload.arrears);
    upsertMany(supplierMonthOverrides, payload.supplierMonthOverrides);
    for (const setting of payload.monthlySettings || []) {
      monthlySettings.set(setting.month, setting);
    }
    const result = {
      id: makeId("sync"),
      userId: actor.id,
      syncedAt: new Date().toISOString(),
      counts: {
        suppliers: payload.suppliers?.length || 0,
        teaLines: payload.teaLines?.length || 0,
        collectionEntries: payload.collectionEntries?.length || 0,
        officeUsers: payload.officeUsers?.length || 0,
        advances: payload.advances?.length || 0,
        fertilizerInstallments: payload.fertilizerInstallments?.length || 0,
        teaPackets: payload.teaPackets?.length || 0,
        supplierPayments: payload.supplierPayments?.length || 0,
        arrears: payload.arrears?.length || 0
      },
      officeUsers: syncedOfficeUsers()
    };
    syncLog.push(result);
    return result;
  }

  return {
    login(username, password) {
      const user = [...users.values()].find((candidate) => candidate.username === username);
      if (!user || !verifyPassword(password, user.passwordHash)) {
        const error = new Error("Invalid username or password");
        error.status = 401;
        throw error;
      }
      if (!user.active) {
        const error = new Error("User account is inactive");
        error.status = 403;
        throw error;
      }
      const token = randomBytes(24).toString("hex");
      sessions.set(token, { token, userId: user.id, createdAt: new Date().toISOString() });
      return { token, user: publicUser(user) };
    },

    createUser(sessionToken, input) {
      requireRole(sessionToken, ["super_admin"]);
      assertManagedRole(input?.role);
      if (!input?.username || !input?.password || !input?.displayName) {
        const error = new Error("role, username, password, and displayName are required");
        error.status = 400;
        throw error;
      }
      if ([...users.values()].some((user) => user.username === input.username)) {
        const error = new Error("Username already exists");
        error.status = 409;
        throw error;
      }
      const user = {
        id: makeId("user"),
        username: input.username,
        displayName: input.displayName,
        role: input.role,
        passwordHash: hashPassword(input.password),
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      users.set(user.id, user);
      return publicUser(user);
    },

    createDirector(sessionToken, input) {
      return this.createUser(sessionToken, { ...input, role: "director" });
    },

    listUsers(sessionToken, role) {
      assertManagedRole(role);
      requireRole(sessionToken, role === "office_user" ? ["super_admin", "director", "office_user"] : ["super_admin", "director"]);
      return [...users.values()]
        .filter((user) => user.role === role)
        .map(publicUser)
        .sort((a, b) => a.displayName.localeCompare(b.displayName));
    },

    listDirectors(sessionToken) {
      return this.listUsers(sessionToken, "director");
    },

    updateUser(sessionToken, userId, input) {
      requireRole(sessionToken, ["super_admin"]);
      const user = users.get(userId);
      if (!user || !["director", "office_user"].includes(user.role)) {
        const error = new Error("Managed user not found");
        error.status = 404;
        throw error;
      }
      if (input.username && input.username !== user.username) {
        if ([...users.values()].some((candidate) => candidate.username === input.username && candidate.id !== userId)) {
          const error = new Error("Username already exists");
          error.status = 409;
          throw error;
        }
        user.username = input.username;
      }
      if (input.displayName) user.displayName = input.displayName;
      if (typeof input.active === "boolean") user.active = input.active;
      if (input.password) user.passwordHash = hashPassword(input.password);
      user.updatedAt = new Date().toISOString();
      users.set(userId, user);
      return publicUser(user);
    },

    logout(sessionToken) {
      sessions.delete(sessionToken);
      return { ok: true };
    },

    getCurrentUser(sessionToken) {
      return publicUser(requireRole(sessionToken, ["super_admin", "office_user", "director"]));
    },

    syncFromDesktop(sessionToken, payload) {
      const user = requireRole(sessionToken, ["super_admin", "office_user"]);
      return syncDesktopPayload(user, payload);
    },

    syncFromTrustedDesktop(payload) {
      return syncDesktopPayload({ id: "trusted_desktop_sync" }, payload);
    },

    getGreenLeafInput(sessionToken, month) {
      requireRole(sessionToken, ["super_admin", "office_user", "director"]);
      return {
        month,
        suppliers: [...suppliers.values()].sort((a, b) => String(a.code || "").localeCompare(String(b.code || ""))),
        entries: [...entries.values()],
        monthlySettings: monthlySettings.get(month),
        supplierMonthOverrides: [...supplierMonthOverrides.values()],
        advances: [...advances.values()],
        fertilizerInstallments: [...fertilizerInstallments.values()],
        teaPackets: [...teaPackets.values()],
        supplierPayments: [...supplierPayments.values()].filter((payment) => payment.month === month),
        arrears: [...arrears.values()]
      };
    },

    seedDesktopData(payload) {
      upsertMany(suppliers, payload.suppliers);
      upsertMany(entries, payload.collectionEntries);
      for (const setting of payload.monthlySettings || []) {
        monthlySettings.set(setting.month, setting);
      }
    }
  };
}
