// 網站用的能力設定：由 config/settings.toml 產生（py web/scripts/sync_config.py），不要手改 config.json。
import raw from "./config.json";
import { abilities, positionList, type Rules } from "./rating";

export const RULES: Rules = { maxScore: raw.maxScore, topN: raw.topN, categories: raw.categories, positions: raw.positions };
export const ABILITIES = abilities(RULES);
export const POSITIONS = positionList(RULES);
export const CATEGORY_NAMES = RULES.categories.map((c) => c.name);
