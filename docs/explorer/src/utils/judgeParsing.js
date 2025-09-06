import { CRITERIA_KEYS, CRITERIA_SHORT } from "./constants";

// Parse judge_raw into think and decide maps
export function parseJudgeRawXML(xml) {
  if (!xml) return { think: {}, decide: {}, sumYes: 0, total: CRITERIA_KEYS.length };
  const outThink = {};
  const outDecide = {};
  try {
    const thinkMatch = xml.match(/<think>([\s\S]*?)<\/think>/i);
    const thinkBlock = thinkMatch ? thinkMatch[1] : "";
    CRITERIA_SHORT.forEach((short, idx) => {
      const re = new RegExp(`<${short}_think>([\\s\\S]*?)<\/${short}_think>`, "i");
      const m = thinkBlock.match(re);
      if (m) {
        outThink[short] = m[1].replace(/\s+/g, " ").trim();
      }
    });
    CRITERIA_SHORT.forEach((short) => {
      const re = new RegExp(`<${short}>(yes|no)<\/${short}>`, "i");
      const m = xml.match(re);
      if (m) outDecide[short] = m[1].toLowerCase();
    });
  } catch (e) {
    // ignore parse errors
  }
  const yesCount = Object.values(outDecide).filter((v) => v === "yes").length;
  return { think: outThink, decide: outDecide, sumYes: yesCount, total: CRITERIA_KEYS.length };
}

