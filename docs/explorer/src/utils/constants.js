// Shared constants for criteria and colors

// Legacy C-keys (back-compat for older runs)
export const CRITERIA_KEYS = [
  "C1_title_present",
  "C2_quatrain_shape",
  "C3_ballad_meter_echo",
  "C4_ballad_rhyme",
  "C5_ring_composition",
  "C6_warning_admonition",
  "C7_preparation_armament",
  "C8_encounter_confrontation",
  "C9_slaying_decisive_action",
  "C10_return_celebration",
  "C11_coinage_count",
  "C12_coinage_spread",
  "C13_creature_naming",
  "C14_onomatopoeia",
  "C15_alliteration_consonance",
  "C16_arc_order",
  "C17_no_verbatim_lines",
  "C18_canonical_budget",
  "C19_syllable_tightness",
  "C20_rhyme_variety",
  "C21_lexical_repetition_guard",
  "C22_coinage_variety",
  "C23_topic_adherence",
  "C24_subtext",
];

export const CRITERIA_SHORT = CRITERIA_KEYS.map((k, i) => `C${i + 1}`);

export const CRITERIA_LABELS = [
  "Title",
  "Quatrains",
  "Meter",
  "Rhyme",
  "Ring",
  "Warning",
  "Prepare",
  "Encounter",
  "Act",
  "Return",
  "Coinages",
  "Spread",
  "Creature",
  "Onomatopoeia",
  "Alliteration",
  "Arc order",
  "No verbatim",
  "Canonical",
  "Syllables",
  "Rhyme variety",
  "Repetition",
  "Coinage variety",
  "Topic adherence",
  "Subtext",
];

// New S/J schema: Radar and Judge use only J-keys
export const JUDGE_KEYS = [
  "J1_ballad_meter_echo",
  "J2_ballad_rhyme",
  "J3_ring_composition",
  "J4_warning_admonition",
  "J5_preparation_armament",
  "J6_encounter_confrontation",
  "J7_slaying_decisive_action",
  "J8_return_celebration",
  "J9_coinage_count",
  "J10_coinage_spread",
  "J11_creature_naming",
  "J12_onomatopoeia",
  "J13_alliteration_consonance",
  "J14_arc_order",
  "J15_rhyme_variety",
  "J16_lexical_repetition_guard",
  "J17_coinage_variety",
  "J18_topic_adherence",
  "J19_subtext",
];
export const JUDGE_SHORT = JUDGE_KEYS.map((k) => k.split("_", 1)[0]);
export const JUDGE_LABELS = [
  "Meter",
  "Rhyme",
  "Ring",
  "Warning",
  "Prepare",
  "Encounter",
  "Act",
  "Return",
  "Coinages",
  "Spread",
  "Creature",
  "Onomatopoeia",
  "Alliteration",
  "Arc order",
  "Rhyme variety",
  "Repetition",
  "Coinage variety",
  "Topic adherence",
  "Subtext",
];

// Deterministic structure keys for radar inclusion
export const S_KEYS = [
  "S1_stanza_count",
  "S2_quatrain_shape",
  "S3_indent_alternation",
  "S4_meter_alt_proxy",
  "S5_syllable_outliers",
  "S6_no_verbatim_lines",
  "S7_title_present",
  "S8_canonical_budget",
];
export const S_SHORT = S_KEYS.map((k) => k.split("_", 1)[0]);
export const S_LABELS = [
  "Stanzas",
  "Quatrains",
  "Indent",
  "Meter",
  "Outliers",
  "No verbatim",
  "Title",
  "Canonical",
];

export const RADAR_COLORS = [
  "#10b981", // bright green (top performer)
  "#06b6d4", // bright cyan
  "#3b82f6", // bright blue
  "#8b5cf6", // bright purple
  "#ec4899", // bright pink
  "#f59e0b", // amber
  "#ef4444", // red
  "#6366f1", // indigo
  "#78716c", // gray
  "#1f2937", // dark gray (lowest performer)
];
