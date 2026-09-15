// Conservative source-derived metadata, not a Haskell interpreter. Only literal
// indices with explicit optional ability constructors are eligible. Ambiguous
// mixed types and dynamic indices are left to the existing live-choice path.
import fs from 'node:fs'
import path from 'node:path'
const root = process.argv[2]
if (!root) throw Error('Pass the backend arkham-api/library/Arkham directory')
function files(dir) { return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):e.name.endsWith('.hs')?[path.join(dir,e.name)]:[]) }
const defs = new Map()
for (const file of files(path.join(root,'Asset','Cards'))) {
  const text=fs.readFileSync(file,'utf8')
  for(const m of text.matchAll(/^(\w+) :: CardDef\r?\n([\s\S]*?)(?=^\w+ ::|$(?![\s\S]))/gm)) {
    const code=m[2].match(/\basset\s+"([0-9]+[a-z]?)"/)
    if(code) defs.set(m[1],code[1])
  }
}
const entries=[]
for(const file of files(path.join(root,'Asset','Assets'))) {
  const text=fs.readFileSync(file,'utf8').replace(/--[^\n]*/g,'')
  const name=text.match(/^(\w+) :: AssetCard /m)?.[1]
  const code=defs.get(name)
  if(!code) continue
  const body=text.match(/^instance HasAbilities[^\n]*\n([\s\S]*?)(?=^instance |^\w+\s|$(?![\s\S]))/m)?.[1]
  if(!body) continue
  const starts=[...body.matchAll(/\b(?:controlled_?|restricted_?|restrictedAbility|mkAbility|fastAbility|reactionAbility|reaction|forcedAbility)\s+([a-z]\w*)\s+(\d+)\b/g)]
  const allowed=new Map()
  for(let i=0;i<starts.length;i++) {
    const index=Number(starts[i][2])
    const part=body.slice(starts[i].index,starts[i+1]?.index??body.length)
    const optional=/\b(?:FastAbility|ReactionAbility|ConstantReaction|fastAbility|reactionAbility|reaction|triggered|freeReaction)\b/.test(part)
    const other=/\b(?:ForcedAbility\w*|forcedAbility|forced|ActionAbility\w*|Objective|fightAction|evadeAction|investigateAction|actionAbility)\b/.test(part)
    const eligible=optional&&!other
    allowed.set(index,(allowed.get(index)??true)&&eligible)
  }
  const indexes=[...allowed].filter(([,ok])=>ok).map(([index])=>index).sort((a,b)=>a-b)
  if(indexes.length) entries.push({code,name,indexes,source:path.relative(root,file).replaceAll('\\','/')})
}
console.log(JSON.stringify(entries.sort((a,b)=>a.code.localeCompare(b.code)),null,2))
