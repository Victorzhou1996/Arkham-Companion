// One-time, parser-based migration of display text. Never rewrites rule values.
import fs from 'node:fs'
import path from 'node:path'
import { parse as parseSfc } from '@vue/compiler-sfc'
import { parse } from '@vue/compiler-dom'

const directory = 'src/arkham/components/debug'
const names = ['CustomCardForm', 'AbilityEditor', 'StepsEditor', 'ValueEditor', 'BindingField', 'BindingToggle', 'BoolField', 'CardCodeField', 'ExpressionEditor', 'OverlayEditor', 'PropertyField', 'ValueMatcherField', 'CustomCardPicker']
const inventory = new Set()
const apply = process.argv.includes('--apply')
const translations = apply ? JSON.parse(fs.readFileSync('src/locales/zh/customCardEditor.json', 'utf8')) : {}
const displayExpressions = {
  CustomCardForm: ['slot.label', "uploading === slot.key ? 'Uploading…' : 'Drop an image'", 't.label', 'CARD_TYPES.find((t) => t.value === form.cardType)?.label', 'c', 'keyword', 'action', "slot.replace('Slot', '')", 'u'],
  AbilityEditor: ['entry.label', 'choice.label', 'abilityLabel(ability)', 'text', 'kind', 'place.label'],
  StepsEditor: ['KIND_LABELS[kindOf(step)]', 'KIND_LABELS[kind]', 'KIND_HELP[kind]', 'kind', 'k', "sk.replace('Skill', '')", 'bound.scope'],
  ExpressionEditor: ['label', 'o.label', 'k', 'p.label', 'QUERY_NOUNS[kind] ?? kind', 'm.label', 'option.label', 'stageLabel(at)'],
  ValueEditor: ['label', 'preset.label', 'bound.detail', 'bound.origin'],
  BoolField: ['label'], ValueMatcherField: ['o.label'],
  BindingField: ['bound.detail', 'bound.origin'],
  CustomCardPicker: ["card.def.cardType.replace(/Type$/, '')"],
}
for (const name of names) {
  const file = path.join(directory, `${name}.vue`)
  const source = fs.readFileSync(file, 'utf8')
  const { descriptor } = parseSfc(source)
  const template = descriptor.template
  const edits = []
  const record = (text, start, end, attribute) => {
    const key = text.replace(/\s+/g, ' ').trim()
    if (!/[a-zA-Z]/.test(key) || /^\$|^https?:|^\{/.test(key)) return
    inventory.add(key)
    if (!apply || !translations[key]) return
    const literal = JSON.stringify(key).slice(1, -1).replaceAll("'", '\\u0027').replaceAll('\\"', '\\u0022')
    const replacement = attribute ? `:${attribute}="ct('${literal}')"` : `{{ ct(${JSON.stringify(key)}) }}`
    edits.push({ start: start + template.loc.start.offset, end: end + template.loc.start.offset, replacement })
  }
  function walk(node, inCode = false) {
    if (node.type === 2 && !inCode) record(node.content, node.loc.start.offset, node.loc.end.offset)
    if (node.type === 1) {
      for (const prop of node.props) {
        if (prop.type === 6 && ['title', 'placeholder', 'aria-label', 'label'].includes(prop.name) && prop.value) {
          record(prop.value.content, prop.loc.start.offset, prop.loc.end.offset, prop.name)
        }
      }
      inCode ||= ['code', 'pre'].includes(node.tag)
    }
    if (apply && node.type === 5 && displayExpressions[name]?.includes(node.content.content.trim())) {
      edits.push({ start: node.content.loc.start.offset + template.loc.start.offset, end: node.content.loc.end.offset + template.loc.start.offset, replacement: `ct(${node.content.content.trim()})` })
    }
    for (const child of node.children ?? []) walk(child, inCode)
  }
  walk(parse(template.content))
  if (edits.length) {
    if (!source.includes('useCustomCardText')) {
      edits.push({ start: descriptor.scriptSetup.loc.start.offset, end: descriptor.scriptSetup.loc.start.offset,
        replacement: "\nimport { useCustomCardText } from '@/arkham/customCardText'\nconst ct = useCustomCardText()\n" })
    }
    let output = source
    for (const edit of edits.sort((a, b) => b.start - a.start)) output = output.slice(0, edit.start) + edit.replacement + output.slice(edit.end)
    fs.writeFileSync(file, output)
  }
}
console.log(JSON.stringify([...inventory].sort(), null, 2))
