/**
 * Per-family lists of a line item's user-facing fields, used by the
 * duplicate-with-field-selection panel (see actions.ts's
 * duplicateLineItemWithOptions and DuplicateLineItemForm.tsx).
 *
 * `key` is the checkbox's stable identity (also what's posted as
 * `field_<key>` in the form). `attributeKeys` lists every key in the
 * line item's `attributes` JSON blob that this one user-facing field
 * actually controls -- almost always a single key, but e.g. Roller's
 * "Linked" field writes both `linkChoice` (the raw dropdown value) and
 * `linked` (the boolean the pricing engine reads) to attributes, so
 * deselecting "Linked" needs to drop both together.
 *
 * `room` is deliberately included as the first field on every family: it's
 * not part of `attributes` (it's the line item's own `room` column), but
 * it's exactly the kind of field a user duplicating "the same blind for a
 * different room" would want to leave unchecked, so it belongs in the same
 * checklist. duplicateLineItemWithOptions handles it specially rather than
 * via attributeKeys.
 *
 * Labels are copied verbatim from each family's own LineItemForm so the
 * checklist reads exactly like the form the estimator already knows.
 */

export interface LineItemFieldConfig {
  key: string;
  label: string;
  attributeKeys: string[];
}

const ROOM_FIELD: LineItemFieldConfig = { key: "room", label: "Room", attributeKeys: [] };

const ROLLER_FIELDS: LineItemFieldConfig[] = [
  ROOM_FIELD,
  { key: "fabricSource", label: "Fabric source", attributeKeys: ["fabricSource"] },
  { key: "fabricName", label: "Fabric", attributeKeys: ["fabricName"] },
  { key: "widthMm", label: "Width (mm)", attributeKeys: ["widthMm"] },
  { key: "heightMm", label: "Height (mm)", attributeKeys: ["heightMm"] },
  { key: "lhCutOut", label: "LH cut out (mm)", attributeKeys: ["lhCutOut"] },
  { key: "rhCutOut", label: "RH cut out (mm)", attributeKeys: ["rhCutOut"] },
  { key: "controlType", label: "Control type", attributeKeys: ["controlType"] },
  { key: "bracketTrack", label: "Bracket / track", attributeKeys: ["bracketTrack"] },
  { key: "cassette", label: "Cassette", attributeKeys: ["cassette"] },
  { key: "linkChoice", label: "Linked", attributeKeys: ["linkChoice", "linked"] },
  { key: "sideChannels", label: "Side channels", attributeKeys: ["sideChannels"] },
  { key: "controlSide", label: "Control side", attributeKeys: ["controlSide"] },
  { key: "chainLength", label: "Chain length", attributeKeys: ["chainLength"] },
  { key: "fitting", label: "Fitting", attributeKeys: ["fitting"] },
  { key: "componentColour", label: "Component colour", attributeKeys: ["componentColour"] },
  { key: "fabricColour", label: "Fabric colour", attributeKeys: ["fabricColour"] },
  { key: "baseStyle", label: "Base style", attributeKeys: ["baseStyle"] },
  { key: "roll", label: "Roll", attributeKeys: ["roll"] },
];

// Venetian / Roman / Panel / Verishade / Vertical (genericBlind.ts) -- same
// attribute shape as Roller minus the roller-only fields above.
const GENERIC_BLIND_FIELDS: LineItemFieldConfig[] = [
  ROOM_FIELD,
  { key: "fabricSource", label: "Fabric source", attributeKeys: ["fabricSource"] },
  { key: "fabricName", label: "Fabric", attributeKeys: ["fabricName"] },
  { key: "widthMm", label: "Width (mm)", attributeKeys: ["widthMm"] },
  { key: "heightMm", label: "Height (mm)", attributeKeys: ["heightMm"] },
  { key: "lhCutOut", label: "LH cut out (mm)", attributeKeys: ["lhCutOut"] },
  { key: "rhCutOut", label: "RH cut out (mm)", attributeKeys: ["rhCutOut"] },
  { key: "controlType", label: "Control type", attributeKeys: ["controlType"] },
  { key: "bracketTrack", label: "Bracket / track", attributeKeys: ["bracketTrack"] },
  { key: "controlSide", label: "Control side", attributeKeys: ["controlSide"] },
  { key: "fitting", label: "Fitting", attributeKeys: ["fitting"] },
  { key: "componentColour", label: "Component colour", attributeKeys: ["componentColour"] },
  { key: "fabricColour", label: "Fabric colour", attributeKeys: ["fabricColour"] },
  { key: "baseStyle", label: "Base style", attributeKeys: ["baseStyle"] },
];

const CURTAIN_FIELDS: LineItemFieldConfig[] = [
  ROOM_FIELD,
  { key: "style", label: "Style", attributeKeys: ["style"] },
  { key: "liningInput", label: "Lining", attributeKeys: ["liningInput"] },
  { key: "finish", label: "Finish", attributeKeys: ["finish"] },
  { key: "trackName", label: "Track", attributeKeys: ["trackName"] },
  { key: "fabricSupplier", label: "Fabric supplier", attributeKeys: ["fabricSupplier"] },
  { key: "fabricName", label: "Fabric", attributeKeys: ["fabricName"] },
  { key: "pricePerMetre", label: "Price per metre ($)", attributeKeys: ["pricePerMetre"] },
  { key: "layout", label: "Layout", attributeKeys: ["layout"] },
  { key: "hooks", label: "Hooks", attributeKeys: ["hooks"] },
  { key: "fitting", label: "Fitting", attributeKeys: ["fitting"] },
  { key: "ctrlSide", label: "Control side", attributeKeys: ["ctrlSide"] },
  { key: "stack", label: "Stack", attributeKeys: ["stack"] },
  { key: "lpwCm", label: "Left of window (cm)", attributeKeys: ["lpwCm"] },
  { key: "wwCm", label: "Wall width (cm)", attributeKeys: ["wwCm"] },
  { key: "rpwCm", label: "Right of window (cm)", attributeKeys: ["rpwCm"] },
  { key: "leftReturnCm", label: "Left return (cm)", attributeKeys: ["leftReturnCm"] },
  { key: "rightReturnCm", label: "Right return (cm)", attributeKeys: ["rightReturnCm"] },
  { key: "overlapCm", label: "Overlap (cm)", attributeKeys: ["overlapCm"] },
  { key: "heightCm", label: "Height (cm)", attributeKeys: ["heightCm"] },
  { key: "cm", label: "Check Measure", attributeKeys: ["cm"] },
];

const MISC_FIELDS: LineItemFieldConfig[] = [
  ROOM_FIELD,
  { key: "description", label: "Description", attributeKeys: ["description"] },
  { key: "additionalDetails", label: "Additional details", attributeKeys: ["additionalDetails"] },
  { key: "price", label: "Price", attributeKeys: ["price"] },
  { key: "installTimeMinutes", label: "Install time (minutes)", attributeKeys: ["installTimeMinutes"] },
];

const ACCESSORY_FIELDS: LineItemFieldConfig[] = [
  ROOM_FIELD,
  { key: "name", label: "Accessory", attributeKeys: ["name"] },
];

const GENERIC_BLIND_SLUGS = new Set(["venetian", "roman", "panel", "verishade", "vertical"]);

export function getLineItemFields(familySlug: string): LineItemFieldConfig[] {
  if (familySlug === "roller") return ROLLER_FIELDS;
  if (GENERIC_BLIND_SLUGS.has(familySlug)) return GENERIC_BLIND_FIELDS;
  if (familySlug === "s_wave_sheer") return CURTAIN_FIELDS;
  if (familySlug === "misc") return MISC_FIELDS;
  if (familySlug === "curtain_accessory" || familySlug === "blind_accessory") return ACCESSORY_FIELDS;
  // Unknown family -- fall back to just Room so duplication still works
  // rather than crashing; nothing in this app currently hits this branch.
  return [ROOM_FIELD];
}
