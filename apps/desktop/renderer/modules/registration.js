import { localMonthValue } from "./format.js";
import { checked, escapeAttribute } from "./html.js";

export function renderOfficeUserEditForm(user) {
  return `
    <form id="editModalForm" class="modal-form" data-kind="office-user">
      <input name="id" type="hidden" value="${escapeAttribute(user.id)}" />
      <input name="role" type="hidden" value="${escapeAttribute(user.role)}" />
      <label>
        Username
        <input name="username" value="${escapeAttribute(user.username)}" required />
      </label>
      <label>
        Display name
        <input name="displayName" value="${escapeAttribute(user.displayName)}" required />
      </label>
      <label>
        New password
        <div class="password-field">
          <input id="editOfficeUserPassword" name="password" placeholder="Leave blank to keep current password" type="password" />
          <button class="password-toggle" type="button" data-toggle-password="editOfficeUserPassword" aria-controls="editOfficeUserPassword" aria-pressed="false">Show</button>
        </div>
      </label>
      <label class="switch-row"><input name="active" type="checkbox" ${checked(user.active)} /> Active</label>
      <button type="submit">Update office user</button>
    </form>`;
}

export function supplierOverrideFromForm(payload) {
  if (!payload.overrideTeaPricePerKg && !payload.overrideId) return null;
  if (!payload.overrideMonth || !payload.overrideSupplierId) return null;
  return {
    id: payload.overrideId || undefined,
    supplierId: payload.overrideSupplierId,
    month: payload.overrideMonth,
    teaPricePerKg: payload.overrideTeaPricePerKg
  };
}

export function lineOverrideFromForm(payload) {
  if (!payload.overrideTeaPricePerKg) return null;
  if (!payload.overrideMonth || (!payload.overrideLineId && !payload.overrideLineName)) return null;
  return {
    lineId: payload.overrideLineId,
    lineName: payload.overrideLineName || payload.name,
    month: payload.overrideMonth,
    teaPricePerKg: payload.overrideTeaPricePerKg
  };
}

export function renderTeaLineEditForm(line) {
  return `
    <form id="editModalForm" class="modal-form" data-kind="tea-line">
      <input name="id" type="hidden" value="${escapeAttribute(line.id)}" />
      <label>
        Line name
        <input name="name" value="${escapeAttribute(line.name)}" required />
      </label>
      <label class="switch-row"><input name="wholeLineBankTransfer" type="checkbox" ${checked(line.wholeLineBankTransfer)} /> Whole Tea Line Bank Transfer</label>
      <div class="check-list">
        <strong>Special price for suppliers in this tea line</strong>
        <input name="overrideLineId" type="hidden" value="${escapeAttribute(line.id)}" />
        <input name="overrideLineName" type="hidden" value="${escapeAttribute(line.name)}" />
        <label>
          Override month
          <input name="overrideMonth" type="month" value="${escapeAttribute(localMonthValue())}" />
        </label>
        <label>
          Special green leaf price per kg
          <input name="overrideTeaPricePerKg" type="number" step="0.01" min="0" placeholder="Leave blank to keep existing line prices" />
        </label>
      </div>
      <label class="switch-row"><input name="active" type="checkbox" ${checked(line.active)} /> Active</label>
      <button type="submit">Update tea line</button>
    </form>`;
}

export function renderLineUserEditForm(user) {
  return `
    <form id="editModalForm" class="modal-form" data-kind="line-user">
      <input name="id" type="hidden" value="${escapeAttribute(user.id)}" />
      <label>
        Username
        <input name="username" value="${escapeAttribute(user.username)}" required />
      </label>
      <label>
        Display name
        <input name="displayName" value="${escapeAttribute(user.displayName)}" required />
      </label>
      <label>
        New password
        <div class="password-field">
          <input id="editLineUserPassword" name="password" placeholder="Leave blank to keep current password" type="password" />
          <button class="password-toggle" type="button" data-toggle-password="editLineUserPassword" aria-controls="editLineUserPassword" aria-pressed="false">Show</button>
        </div>
      </label>
      <label class="switch-row"><input name="active" type="checkbox" ${checked(user.active)} /> Active</label>
      <button type="submit">Update line user</button>
    </form>`;
}

export function renderSupplierEditForm(supplier, state) {
  const override = currentSupplierPriceOverride(state, supplier.id);
  return `
    <form id="editModalForm" class="modal-form" data-kind="supplier">
      <input name="id" type="hidden" value="${escapeAttribute(supplier.id)}" />
      <label>
        Supplier code
        <input name="code" value="${escapeAttribute(supplier.code)}" required />
      </label>
      <label>
        Supplier name
        <input name="name" value="${escapeAttribute(supplier.name)}" required />
      </label>
      <label>
        Tea line
        <input name="lineName" list="teaLineOptions" value="${escapeAttribute(supplier.lineName)}" required />
      </label>
      <label>
        Payment mode
        <select name="paymentMode">
          <option value="cash" ${supplier.paymentMode === "bank_transfer" ? "" : "selected"}>Cash</option>
          <option value="bank_transfer" ${supplier.paymentMode === "bank_transfer" ? "selected" : ""}>Bank transfer</option>
        </select>
      </label>
      <div class="check-list">
        <label><input type="checkbox" name="deductionEnabled" ${checked(supplier.deductionEnabled)} /> 2% end-month deduction</label>
        <label><input type="checkbox" name="ownTransportAdditionEnabled" ${checked(supplier.ownTransportAdditionEnabled)} /> Own transport addition</label>
        <label><input type="checkbox" name="factoryTransportDeductionEnabled" ${checked(supplier.factoryTransportDeductionEnabled)} /> Factory transport deduction</label>
        <label><input type="checkbox" name="excludeFromBalance" ${checked(supplier.excludeFromBalance)} /> Factory-owned supplier: do not calculate payable balance</label>
      </div>
      <div class="check-list">
        <strong>Special supplier price for a month</strong>
        <input name="overrideId" type="hidden" value="${escapeAttribute(override?.id || "")}" />
        <input name="overrideSupplierId" type="hidden" value="${escapeAttribute(supplier.id)}" />
        <label>
          Override month
          <input name="overrideMonth" type="month" value="${escapeAttribute(override?.month || localMonthValue())}" />
        </label>
        <label>
          Special green leaf price per kg
          <input name="overrideTeaPricePerKg" type="number" step="0.01" min="0" value="${escapeAttribute(override?.teaPricePerKg ?? "")}" placeholder="Leave blank to use monthly setting" />
        </label>
      </div>
      <label class="switch-row"><input name="active" type="checkbox" ${checked(supplier.active)} /> Active</label>
      <button type="submit">Update supplier</button>
    </form>`;
}

export function currentSupplierPriceOverride(state, supplierId, month = localMonthValue()) {
  return state?.supplierMonthOverrides.find(
    (override) => override.supplierId === supplierId && override.month === month && override.teaPricePerKg !== null
  );
}
