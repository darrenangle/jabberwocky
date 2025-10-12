import { JUDGE_KEYS, JUDGE_SHORT } from "./constants";

// Parse judge_raw into think and decide maps
export function parseJudgeRawXML(xml) {
  if (!xml) return { think: {}, decide: {}, sumYes: 0, total: JUDGE_KEYS.length, scheme: "J" };
  const outThink = {};
  const outDecide = {};
  let scheme = "J";
  try {
    const thinkMatch = xml.match(/<think>([\s\S]*?)<\/think>/i);
    const thinkBlock = thinkMatch ? thinkMatch[1] : "";
    JUDGE_SHORT.forEach((short) => {
      const reT = new RegExp(`<${short}_think>([\\s\\S]*?)<\/${short}_think>`, "i");
      const mt = thinkBlock.match(reT);
      if (mt) outThink[short] = mt[1].replace(/\s+/g, " ").trim();
      const re = new RegExp(`<${short}>(yes|no)<\/${short}>`, "i");
      const m = xml.match(re);
      if (m) outDecide[short] = m[1].toLowerCase();
    });
  } catch (e) {
    // ignore parse errors
  }
  const yesCount = Object.values(outDecide).filter((v) => v === "yes").length;
  const total = JUDGE_KEYS.length;
  return { think: outThink, decide: outDecide, sumYes: yesCount, total, scheme };
}
