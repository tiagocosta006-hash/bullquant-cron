import fs from 'fs'
const path = 'app/api/dcf/analyses/route.ts'
let content = fs.readFileSync(path, 'utf8')
content = content.replace(/isPublic:\s*false/g, 'isPublic: true')
fs.writeFileSync(path, content)
