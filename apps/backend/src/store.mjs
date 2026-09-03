import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { buildGreenLeafBookWithAutoArrears, makeId, suggestAdvancePayment } from "../../../packages/shared/src/index.mjs";

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
  const balanceTransferSignals = new Map();
  const factoryOfficerTransferSignals = new Map();
  const advanceSignals = new Map();
  const arrears = new Map();
  const monthClosures = new Map();
  const webAuditLogs = [];
  const syncLog = [];

  for (const user of [
    { id: "user_superadmin", username: "superadmin", displayName: "Super Admin", role: "super_admin", password: "admin123" },
    { id: "user_admin", username: "admin", displayName: "Admin", role: "super_admin", password: "admin123" },
    { id: "user_default_director", username: "director", displayName: "Default Director", role: "director", password: "director123" },
    { id: "user_default_office", username: "office", displayName: "Default Office User", role: "office_user", password: "office123" }
  ]) {
    users.set(user.id, {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      passwordHash: hashPassword(user.password),
      active: true,
      createdAt: new Date().toISOString()
    });
  }

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

  function money(value) {
    return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
  }

  function normalizeMonth(month) {
    if (/^\d{4}-\d{2}$/.test(String(month || ""))) return month;
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }

  function dateOnly(value = new Date()) {
    return String(value instanceof Date ? value.toISOString() : value || new Date().toISOString()).slice(0, 10);
  }

  function previousMonthValue(month) {
    const [year, monthNumber] = String(month).split("-").map(Number);
    const previous = new Date(Date.UTC(year, monthNumber - 2, 1));
    return `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, "0")}`;
  }

  function publicBalanceSignal(signal) {
    return signal || null;
  }

  function sanitizeAuditValue(value) {
    if (Array.isArray(value)) return value.map((item) => sanitizeAuditValue(item));
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value)
          .filter(([key]) => !/password|hash|token|authorization/i.test(key))
          .map(([key, child]) => [key, sanitizeAuditValue(child)])
      );
    }
    return value;
  }

  function publicWebAuditLog(entry) {
    return {
      ...entry,
      before: entry.beforeJson ? JSON.parse(entry.beforeJson) : null,
      after: entry.afterJson ? JSON.parse(entry.afterJson) : null
    };
  }

  function recordWebAudit(user, entry) {
    const auditEntry = {
      id: makeId("web_audit"),
      userId: user?.id || null,
      username: user?.username || "",
      displayName: user?.displayName || user?.username || "",
      role: user?.role || "",
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId || "",
      entityLabel: entry.entityLabel || "",
      summary: entry.summary || "",
      beforeJson: entry.before === undefined ? null : JSON.stringify(sanitizeAuditValue(entry.before)),
      afterJson: entry.after === undefined ? null : JSON.stringify(sanitizeAuditValue(entry.after)),
      createdAt: new Date().toISOString()
    };
    webAuditLogs.push(auditEntry);
    return auditEntry;
  }

  function assertCanChangeSignal(signal, user) {
    if (!signal) {
      const error = new Error("Signal not found");
      error.status = 404;
      throw error;
    }
    if (user.role !== "super_admin" && signal.markedByUserId !== user.id) {
      const error = new Error("Directors can change only records they added");
      error.status = 403;
      throw error;
    }
  }

  function markSignalMapRead(map, signalId, user) {
    const signal = map.get(signalId);
    if (!signal) {
      const error = new Error("Signal not found");
      error.status = 404;
      throw error;
    }
    const updated = {
      ...signal,
      readAt: new Date().toISOString(),
      readByUserId: user.id,
      readByDisplayName: user.displayName || user.username
    };
    map.set(signalId, updated);
    return updated;
  }

  function buildBalances(input, signals, factorySignals) {
    const book = buildGreenLeafBookWithAutoArrears(input);
    const teaLineMap = new Map((input.teaLines || []).map((line) => [line.id || line.name, line]));
    const lineRows = new Map();
    const supplierRows = [];
    const factorySupplierRows = [];

    for (const row of book.rows.filter((item) => !item.balanceExcluded)) {
      const line = teaLineMap.get(row.lineId) || teaLineMap.get(row.lineName) || {};
      const isWholeLine = Boolean(line.wholeLineBankTransfer);
      const positiveBalance = Math.max(0, Number(row.balanceToPay || 0));
      if (isWholeLine) {
        const lineKey = row.lineId || row.lineName;
        const current = lineRows.get(lineKey) || {
          lineId: row.lineId || lineKey,
          lineName: row.lineName || line.name || "",
          supplierCount: 0,
          positiveBalance: 0
        };
        current.supplierCount += 1;
        current.positiveBalance = money(current.positiveBalance + positiveBalance);
        lineRows.set(lineKey, current);
      } else if (row.paymentMode === "bank_transfer") {
        supplierRows.push({
          supplierId: row.supplierId,
          supplierCode: row.supplierCode,
          supplierName: row.supplierName,
          lineName: row.lineName,
          balanceToPay: row.balanceToPay,
          positiveBalance
        });
      } else {
        factorySupplierRows.push({
          supplierId: row.supplierId,
          supplierCode: row.supplierCode,
          supplierName: row.supplierName,
          lineName: row.lineName,
          balanceToPay: row.balanceToPay
        });
      }
    }

    const signalKey = (section, targetId) => `${book.month}:${section}:${targetId}`;
    const lineWiseBankTransfers = [...lineRows.values()]
      .filter((row) => row.positiveBalance > 0)
      .map((row) => ({
        ...row,
        signal: publicBalanceSignal(signals.get(signalKey("line", row.lineId || row.lineName)))
      }))
      .sort((a, b) => a.lineName.localeCompare(b.lineName));

    const supplierWiseBankTransfers = supplierRows
      .filter((row) => row.positiveBalance > 0)
      .map((row) => ({
        ...row,
        signal: publicBalanceSignal(signals.get(signalKey("supplier", row.supplierId)))
      }))
      .sort((a, b) => String(a.supplierCode || "").localeCompare(String(b.supplierCode || "")));

    const factoryPositiveBalance = money(
      factorySupplierRows.reduce((total, row) => total + Math.max(0, Number(row.balanceToPay || 0)), 0)
    );
    const factoryNegativeBalance = money(
      factorySupplierRows.reduce((total, row) => total + Math.min(0, Number(row.balanceToPay || 0)), 0)
    );
    const factoryOfficerPayments = factorySignals
      .filter((signal) => signal.month === book.month)
      .sort((a, b) => new Date(a.markedAt) - new Date(b.markedAt));
    let runningRemaining = factoryPositiveBalance;
    const paymentsWithRemaining = factoryOfficerPayments.map((payment) => {
      runningRemaining = money(Math.max(0, runningRemaining - Number(payment.amount || 0)));
      return { ...payment, remainingPositiveBalance: runningRemaining };
    });

    return {
      month: book.month,
      lineWiseBankTransfers,
      supplierWiseBankTransfers,
      factoryOfficerTransfers: {
        suppliers: factorySupplierRows.sort((a, b) => String(a.supplierCode || "").localeCompare(String(b.supplierCode || ""))),
        positiveBalance: factoryPositiveBalance,
        negativeBalance: factoryNegativeBalance,
        payments: paymentsWithRemaining,
        remainingPositiveBalance: runningRemaining
      }
    };
  }

  function activeSuppliers() {
    return [...suppliers.values()]
      .filter((supplier) => supplier.active !== false)
      .sort((a, b) => String(a.code || "").localeCompare(String(b.code || "")));
  }

  function activeTeaLines() {
    return [...teaLines.values()]
      .filter((line) => line.active !== false)
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  }

  function supplierAdvanceBreakdown(input, supplier) {
    const suggestion = suggestAdvancePayment({ ...input, supplierId: supplier.id });
    return {
      supplierId: supplier.id,
      supplierCode: supplier.code,
      supplierName: supplier.name,
      lineId: supplier.lineId,
      lineName: supplier.lineName,
      suggestedAmount: suggestion.suggestedAmount,
      leafValue: suggestion.leafValue,
      arrearsCarriedForward: suggestion.arrearsCarriedForward,
      totalAdvances: suggestion.totalAdvances
    };
  }

  function advanceSuggestion(input, scope, targetId) {
    if (scope === "line") {
      const line = activeTeaLines().find((item) => item.id === targetId || item.name === targetId);
      if (!line) {
        const error = new Error("Tea line not found");
        error.status = 404;
        throw error;
      }
      const breakdown = activeSuppliers()
        .filter((supplier) => supplier.lineId === line.id || supplier.lineName === line.name)
        .map((supplier) => supplierAdvanceBreakdown(input, supplier))
        .filter((item) => item.leafValue > 0 || item.arrearsCarriedForward > 0 || item.totalAdvances > 0 || item.suggestedAmount > 0);
      return {
        scope: "line",
        targetId: line.id,
        targetLabel: line.name,
        suggestedAmount: money(breakdown.reduce((total, item) => total + Number(item.suggestedAmount || 0), 0)),
        breakdown
      };
    }
    const supplier = activeSuppliers().find((item) => item.id === targetId);
    if (!supplier) {
      const error = new Error("Supplier not found");
      error.status = 404;
      throw error;
    }
    const breakdown = [supplierAdvanceBreakdown(input, supplier)];
    return {
      scope: "supplier",
      targetId: supplier.id,
      targetLabel: `${supplier.code || ""} ${supplier.name || ""}`.trim(),
      suggestedAmount: breakdown[0].suggestedAmount,
      breakdown
    };
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
    upsertMany(monthClosures, payload.monthClosures);
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
        supplierMonthOverrides: payload.supplierMonthOverrides?.length || 0,
        arrears: payload.arrears?.length || 0,
        monthClosures: payload.monthClosures?.length || 0
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
      recordWebAudit(user, {
        action: "login",
        entityType: "session",
        entityId: user.id,
        entityLabel: user.username,
        summary: `${user.displayName || user.username} logged in`
      });
      return { token, user: publicUser(user) };
    },

    createUser(sessionToken, input) {
      const actor = requireRole(sessionToken, ["super_admin"]);
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
      const safeUser = publicUser(user);
      recordWebAudit(actor, {
        action: "create",
        entityType: "user",
        entityId: user.id,
        entityLabel: user.username,
        summary: `Created ${user.role} user ${user.username}`,
        after: safeUser
      });
      return safeUser;
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
      const actor = requireRole(sessionToken, ["super_admin"]);
      const user = users.get(userId);
      if (!user || !["director", "office_user"].includes(user.role)) {
        const error = new Error("Managed user not found");
        error.status = 404;
        throw error;
      }
      const before = publicUser({ ...user });
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
      const after = publicUser(user);
      recordWebAudit(actor, {
        action: "update",
        entityType: "user",
        entityId: user.id,
        entityLabel: user.username,
        summary: `Updated ${user.role} user ${user.username}`,
        before,
        after
      });
      return after;
    },

    logout(sessionToken) {
      const session = sessions.get(sessionToken);
      const user = session ? users.get(session.userId) : null;
      sessions.delete(sessionToken);
      if (user) {
        recordWebAudit(user, {
          action: "logout",
          entityType: "session",
          entityId: user.id,
          entityLabel: user.username,
          summary: `${user.displayName || user.username} logged out`
        });
      }
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
      const normalizedMonth = normalizeMonth(month);
      const previousMonth = previousMonthValue(normalizedMonth);
      return {
        month: normalizedMonth,
        teaLines: [...teaLines.values()].filter((line) => line.active !== false),
        suppliers: [...suppliers.values()].sort((a, b) => String(a.code || "").localeCompare(String(b.code || ""))),
        entries: [...entries.values()],
        monthlySettings: [monthlySettings.get(previousMonth), monthlySettings.get(normalizedMonth)].filter(Boolean),
        supplierMonthOverrides: [...supplierMonthOverrides.values()],
        advances: [...advances.values()],
        fertilizerInstallments: [...fertilizerInstallments.values()],
        teaPackets: [...teaPackets.values()],
        supplierPayments: [...supplierPayments.values()],
        arrears: [...arrears.values()],
        monthClosures: [...monthClosures.values()]
      };
    },

    getBalances(sessionToken, month) {
      const input = this.getGreenLeafInput(sessionToken, month);
      return buildBalances(input, balanceTransferSignals, [...factoryOfficerTransferSignals.values()]);
    },

    listAdvanceSignals(sessionToken) {
      requireRole(sessionToken, ["super_admin", "office_user", "director"]);
      return {
        suppliers: activeSuppliers().map((supplier) => ({
          id: supplier.id,
          code: supplier.code,
          name: supplier.name,
          lineId: supplier.lineId,
          lineName: supplier.lineName
        })),
        teaLines: activeTeaLines().map((line) => ({
          id: line.id,
          name: line.name
        })),
        signals: [...advanceSignals.values()].sort((a, b) => new Date(b.markedAt) - new Date(a.markedAt))
      };
    },

    getAdvanceSuggestion(sessionToken, input) {
      requireRole(sessionToken, ["super_admin", "office_user", "director"]);
      const month = normalizeMonth(input.month);
      return advanceSuggestion(this.getGreenLeafInput(sessionToken, month), input.scope === "line" ? "line" : "supplier", input.targetId);
    },

    createAdvanceSignal(sessionToken, input) {
      const user = requireRole(sessionToken, ["super_admin", "director"]);
      const effectiveMonth = normalizeMonth(input.effectiveMonth);
      const scope = input.scope === "line" ? "line" : "supplier";
      const targetId = String(input.targetId || "").trim();
      const amount = money(input.amount);
      if (!targetId || !input.dateGiven || amount <= 0) {
        const error = new Error("scope, target, effectiveMonth, dateGiven, and amount are required");
        error.status = 400;
        throw error;
      }
      const suggestion = advanceSuggestion(this.getGreenLeafInput(sessionToken, effectiveMonth), scope, targetId);
      const signal = {
        id: makeId("advance_signal"),
        scope,
        targetId: suggestion.targetId,
        targetLabel: suggestion.targetLabel,
        effectiveMonth,
        dateGiven: String(input.dateGiven).slice(0, 10),
        suggestedAmount: money(suggestion.suggestedAmount),
        amount,
        breakdown: suggestion.breakdown,
        comment: input.comment || "",
        markedAt: new Date().toISOString(),
        markedByUserId: user.id,
        markedByDisplayName: user.displayName || user.username,
        readAt: null,
        readByUserId: null,
        readByDisplayName: null
      };
      advanceSignals.set(signal.id, signal);
      recordWebAudit(user, {
        action: "create",
        entityType: "advance_signal",
        entityId: signal.id,
        entityLabel: signal.targetLabel,
        summary: `Created advance signal for ${signal.targetLabel}`,
        after: signal
      });
      return signal;
    },

    updateAdvanceSignal(sessionToken, signalId, input) {
      const user = requireRole(sessionToken, ["super_admin", "director"]);
      const existing = advanceSignals.get(signalId);
      assertCanChangeSignal(existing, user);
      const effectiveMonth = normalizeMonth(input.effectiveMonth || existing.effectiveMonth);
      const amount = money(input.amount ?? existing.amount);
      if (!input.dateGiven && !existing.dateGiven) {
        const error = new Error("dateGiven is required");
        error.status = 400;
        throw error;
      }
      if (amount <= 0) {
        const error = new Error("amount must be greater than zero");
        error.status = 400;
        throw error;
      }
      const suggestion = advanceSuggestion(this.getGreenLeafInput(sessionToken, effectiveMonth), existing.scope, existing.targetId);
      const updated = {
        ...existing,
        effectiveMonth,
        dateGiven: String(input.dateGiven || existing.dateGiven).slice(0, 10),
        suggestedAmount: money(suggestion.suggestedAmount),
        amount,
        breakdown: suggestion.breakdown,
        comment: input.comment ?? existing.comment,
        readAt: null,
        readByUserId: null,
        readByDisplayName: null
      };
      advanceSignals.set(signalId, updated);
      recordWebAudit(user, {
        action: "update",
        entityType: "advance_signal",
        entityId: signalId,
        entityLabel: updated.targetLabel,
        summary: `Updated advance signal for ${updated.targetLabel}`,
        before: existing,
        after: updated
      });
      return updated;
    },

    deleteAdvanceSignal(sessionToken, signalId) {
      const user = requireRole(sessionToken, ["super_admin", "director"]);
      const existing = advanceSignals.get(signalId);
      assertCanChangeSignal(existing, user);
      advanceSignals.delete(signalId);
      recordWebAudit(user, {
        action: "delete",
        entityType: "advance_signal",
        entityId: signalId,
        entityLabel: existing.targetLabel,
        summary: `Deleted advance signal for ${existing.targetLabel}`,
        before: existing
      });
      return { ok: true };
    },

    markBalancePaid(sessionToken, input) {
      const user = requireRole(sessionToken, ["super_admin", "director"]);
      const month = normalizeMonth(input.month);
      const section = input.section === "supplier" ? "supplier" : "line";
      const targetId = String(input.targetId || "").trim();
      if (!targetId) {
        const error = new Error("targetId is required");
        error.status = 400;
        throw error;
      }
      const id = `${month}:${section}:${targetId}`;
      const existing = balanceTransferSignals.get(id);
      if (existing) assertCanChangeSignal(existing, user);
      const signal = {
        id,
        month,
        section,
        targetId,
        targetLabel: input.targetLabel || "",
        amount: money(input.amount),
        paymentDoneDate: dateOnly(input.paymentDoneDate || existing?.paymentDoneDate),
        comment: input.comment || "",
        markedAt: existing?.markedAt || new Date().toISOString(),
        markedByUserId: existing?.markedByUserId || user.id,
        markedByDisplayName: existing?.markedByDisplayName || user.displayName || user.username,
        readAt: null,
        readByUserId: null,
        readByDisplayName: null
      };
      balanceTransferSignals.set(id, signal);
      recordWebAudit(user, {
        action: existing ? "update" : "create",
        entityType: "balance_signal",
        entityId: id,
        entityLabel: signal.targetLabel,
        summary: `${existing ? "Updated" : "Created"} ${section} balance signal for ${signal.targetLabel || targetId}`,
        before: existing,
        after: signal
      });
      return signal;
    },

    deleteBalanceSignal(sessionToken, signalId) {
      const user = requireRole(sessionToken, ["super_admin", "director"]);
      const existing = balanceTransferSignals.get(signalId);
      assertCanChangeSignal(existing, user);
      balanceTransferSignals.delete(signalId);
      recordWebAudit(user, {
        action: "delete",
        entityType: "balance_signal",
        entityId: signalId,
        entityLabel: existing.targetLabel,
        summary: `Deleted ${existing.section} balance signal for ${existing.targetLabel || existing.targetId}`,
        before: existing
      });
      return { ok: true };
    },

    addFactoryOfficerTransfer(sessionToken, input) {
      const user = requireRole(sessionToken, ["super_admin", "director"]);
      const amount = money(input.amount);
      if (amount <= 0) {
        const error = new Error("amount must be greater than zero");
        error.status = 400;
        throw error;
      }
      const signal = {
        id: makeId("factory_transfer"),
        month: normalizeMonth(input.month),
        amount,
        paymentDoneDate: dateOnly(input.paymentDoneDate),
        comment: input.comment || "",
        markedAt: new Date().toISOString(),
        markedByUserId: user.id,
        markedByDisplayName: user.displayName || user.username,
        readAt: null,
        readByUserId: null,
        readByDisplayName: null
      };
      factoryOfficerTransferSignals.set(signal.id, signal);
      recordWebAudit(user, {
        action: "create",
        entityType: "factory_transfer_signal",
        entityId: signal.id,
        entityLabel: signal.month,
        summary: `Created factory officer transfer signal for ${signal.month}`,
        after: signal
      });
      return signal;
    },

    updateFactoryOfficerTransfer(sessionToken, signalId, input) {
      const user = requireRole(sessionToken, ["super_admin", "director"]);
      const existing = factoryOfficerTransferSignals.get(signalId);
      assertCanChangeSignal(existing, user);
      const amount = money(input.amount ?? existing.amount);
      if (amount <= 0) {
        const error = new Error("amount must be greater than zero");
        error.status = 400;
        throw error;
      }
      const updated = {
        ...existing,
        amount,
        paymentDoneDate: dateOnly(input.paymentDoneDate || existing.paymentDoneDate),
        comment: input.comment ?? existing.comment,
        readAt: null,
        readByUserId: null,
        readByDisplayName: null
      };
      factoryOfficerTransferSignals.set(signalId, updated);
      recordWebAudit(user, {
        action: "update",
        entityType: "factory_transfer_signal",
        entityId: signalId,
        entityLabel: updated.month,
        summary: `Updated factory officer transfer signal for ${updated.month}`,
        before: existing,
        after: updated
      });
      return updated;
    },

    deleteFactoryOfficerTransfer(sessionToken, signalId) {
      const user = requireRole(sessionToken, ["super_admin", "director"]);
      const existing = factoryOfficerTransferSignals.get(signalId);
      assertCanChangeSignal(existing, user);
      factoryOfficerTransferSignals.delete(signalId);
      recordWebAudit(user, {
        action: "delete",
        entityType: "factory_transfer_signal",
        entityId: signalId,
        entityLabel: existing.month,
        summary: `Deleted factory officer transfer signal for ${existing.month}`,
        before: existing
      });
      return { ok: true };
    },

    markSignalRead(sessionToken, input) {
      const user = requireRole(sessionToken, ["super_admin", "office_user"]);
      const type = String(input.type || "").trim();
      const signalId = String(input.id || "").trim();
      if (!signalId) {
        const error = new Error("Signal id is required");
        error.status = 400;
        throw error;
      }
      let updated;
      let entityType;
      if (type === "advance") {
        updated = markSignalMapRead(advanceSignals, signalId, user);
        entityType = "advance_signal";
      } else if (type === "balance") {
        updated = markSignalMapRead(balanceTransferSignals, signalId, user);
        entityType = "balance_signal";
      } else if (type === "factory") {
        updated = markSignalMapRead(factoryOfficerTransferSignals, signalId, user);
        entityType = "factory_transfer_signal";
      }
      if (updated) {
        recordWebAudit(user, {
          action: "mark_read",
          entityType,
          entityId: signalId,
          entityLabel: updated.targetLabel || updated.month || "",
          summary: `Marked ${type} signal as read`,
          after: updated
        });
        return updated;
      }
      const error = new Error("Signal type must be advance, balance, or factory");
      error.status = 400;
      throw error;
    },

    listWebAuditLogs(sessionToken) {
      requireRole(sessionToken, ["super_admin"]);
      return webAuditLogs
        .slice()
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .map(publicWebAuditLog);
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
