const assert = require('node:assert/strict');

function replaceOnce(source, from, to) {
  assert.equal(source.split(from).length, 2, `Unknown legacy protocol hook: ${from}`);
  return source.replace(from, to);
}

function patchLegacyProtocol(source) {
  source = replaceOnce(source, 'Dn=l([n({tag:t("Static"),contents:i()},"Static"),n({tag:t("PerPlayer"),contents:i()},"PerPlayer")],"GameValue")', 'Dn=l([n({tag:t("Static"),contents:i()},"Static"),n({tag:t("PerPlayer"),contents:i()},"PerPlayer"),n({tag:t("ValueX")},"ValueX").map(()=>({tag:"ValueX",contents:0}))],"GameValue")');
  source = replaceOnce(source, '"BlessToken","FrostToken"],W=', '"BlessToken","FrostToken","BloodToken"],W=');
  source = replaceOnce(source, 't("FrostToken")],"TokenFace")', 't("FrostToken"),t("BloodToken")],"TokenFace")');
  return replaceOnce(source, 'case"FrostToken":return M("ct_frost.png");', 'case"FrostToken":return M("ct_frost.png");case"BloodToken":return M("ct_blood.png");');
}

function patchLegacyTokenArt(source) {
  const marker = 'case"FrostToken":return imgsrc("ct_frost.png");';
  assert.equal(source.split(marker).length, 3, 'Expected both legacy log and token-picker renderers');
  return source.replaceAll(marker, marker + 'case"BloodToken":return imgsrc("ct_blood.png");');
}

module.exports = { patchLegacyProtocol, patchLegacyTokenArt };
