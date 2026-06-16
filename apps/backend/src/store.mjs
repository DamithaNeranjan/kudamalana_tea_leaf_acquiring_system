import { createHash, randomBytes } from "node:crypto";
import { makeId } from "../../../packages/shared/src/index.mjs";

function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const hash = createHash("sha256").update(`${salt}:${password}`).digest("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, expected] = String(stored || "").split(":");
  if (!salt || !expected) return false;
  return hashPassword(password, salt) === stored;
}

export function createMemoryStore() {
  const users = new Map();
  const sessions = new Map();
  const suppliers = new Map();
  const entries = new Map();
  const monthlySettings = new Map();
  const supplierMonthOverrides = new Map();
  const advances = new Map();
  const fertilizerInstallments = new Map();
  const teaPackets = new Map();
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

  return {
    login(username, password) {
      const user = [...users.values()].find((candidate) => candidate.username === username);
      if (!user || !verifyPassword(password, user.passwordHash)) {
        const error = new Error("Invalid username or password");
        error.status = 401;
        throw error;
      }
      const token = randomBytes(24).toString("hex");
      sessions.set(token, { token, userId: user.id, createdAt: new Date().toISOString() });
      return { token, user: publicUser(user) };
    },

    createDirector(sessionToken, input) {
      requireRole(sessionToken, ["super_admin"]);
      if (!input?.username || !input?.password || !input?.displayName) {
        const error = new Error("username, password, and displayName are required");
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
        role: "director",
        passwordHash: hashPassword(input.password),
        active: true,
        createdAt: new Date().toISOString()
      };
      users.set(user.id, user);
      return publicUser(user);
    },

    logout(sessionToken) {
      sessions.delete(sessionToken);
      return { ok: true };
    },

    syncFromDesktop(sessionToken, payload) {
      const user = requireRole(sessionToken, ["super_admin", "office_user"]);
      upsertMany(suppliers, payload.suppliers);
      upsertMany(entries, payload.collectionEntries);
      upsertMany(advances, payload.advances);
      upsertMany(fertilizerInstallments, payload.fertilizerInstallments);
      upsertMany(teaPackets, payload.teaPackets);
      upsertMany(arrears, payload.arrears);
      upsertMany(supplierMonthOverrides, payload.supplierMonthOverrides);
      for (const setting of payload.monthlySettings || []) {
        monthlySettings.set(setting.month, setting);
      }
      const result = {
        id: makeId("sync"),
        userId: user.id,
        syncedAt: new Date().toISOString(),
        counts: {
          suppliers: payload.suppliers?.length || 0,
          collectionEntries: payload.collectionEntries?.length || 0,
          advances: payload.advances?.length || 0,
          fertilizerInstallments: payload.fertilizerInstallments?.length || 0,
          teaPackets: payload.teaPackets?.length || 0,
          arrears: payload.arrears?.length || 0
        }
      };
      syncLog.push(result);
      return result;
    },

    getGreenLeafInput(sessionToken, month) {
      requireRole(sessionToken, ["super_admin", "office_user", "director"]);
      return {
        month,
        suppliers: [...suppliers.values()],
        entries: [...entries.values()],
        monthlySettings: monthlySettings.get(month),
        supplierMonthOverrides: [...supplierMonthOverrides.values()],
        advances: [...advances.values()],
        fertilizerInstallments: [...fertilizerInstallments.values()],
        teaPackets: [...teaPackets.values()],
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
