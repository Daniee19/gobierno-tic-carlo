// Verifica la trazabilidad requisito → riesgo → código → prueba y regenera proceso/matriz-trazabilidad.md.
// Uso: npm run trazabilidad   (termina con código 1 si hay huecos; sirve como control de calidad en CI)
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

interface Riesgo { id: string; descripcion: string; probabilidad: string; impacto: string }
interface Requisito {
  id: string;
  texto: string;
  riesgos: string[];
  diseno: string;
  verificacion: "prueba" | "manual";
  evidencia?: string;
}

const root = process.cwd();
const catalogo = JSON.parse(readFileSync(path.join(root, "proceso", "requisitos.json"), "utf8")) as {
  riesgos: Riesgo[];
  requisitos: Requisito[];
};

function walk(dir: string, exts: string[]): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === "node_modules" || name === ".next") return [];
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return walk(full, exts);
    return exts.some((e) => name.endsWith(e)) ? [full] : [];
  });
}

const ID_RE = /\b(?:RF|RNF)-\d{2}\b/g;
const rel = (f: string) => path.relative(root, f).split(path.sep).join("/");

// Código: etiquetas "@req RF-01 RNF-03" en src/ y sql/
const codigo = new Map<string, Set<string>>();
for (const file of [...walk(path.join(root, "src"), [".ts", ".tsx"]), ...walk(path.join(root, "sql"), [".sql"])]) {
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const tag = line.match(/@req\s+(.*)$/);
    if (!tag) continue;
    for (const id of tag[1].match(ID_RE) ?? []) {
      if (!codigo.has(id)) codigo.set(id, new Set());
      codigo.get(id)!.add(rel(file));
    }
  }
}

// Pruebas: IDs entre corchetes en el título de cada it("...")
const pruebas = new Map<string, string[]>();
for (const file of walk(path.join(root, "tests"), [".test.ts"])) {
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const title = line.match(/\bit\(\s*[`"'](.*?)[`"']\s*,/);
    if (!title) continue;
    for (const id of title[1].match(ID_RE) ?? []) {
      if (!pruebas.has(id)) pruebas.set(id, []);
      pruebas.get(id)!.push(title[1].replace(/\[[^\]]+\]\s*/g, "").trim());
    }
  }
}

// Validaciones
const errores: string[] = [];
const idsReq = new Set(catalogo.requisitos.map((r) => r.id));
const idsRiesgo = new Set(catalogo.riesgos.map((r) => r.id));

for (const [id, files] of codigo) if (!idsReq.has(id)) errores.push(`Código etiqueta un requisito inexistente ${id}: ${[...files].join(", ")}`);
for (const id of pruebas.keys()) if (!idsReq.has(id)) errores.push(`Una prueba cita un requisito inexistente ${id}`);
for (const r of catalogo.requisitos) {
  for (const k of r.riesgos) if (!idsRiesgo.has(k)) errores.push(`${r.id} cita un riesgo inexistente ${k}`);
  if (!codigo.has(r.id)) errores.push(`${r.id} no tiene código etiquetado (@req)`);
  if (r.verificacion === "prueba" && !pruebas.has(r.id)) errores.push(`${r.id} no tiene prueba automática`);
  if (r.verificacion === "manual" && !r.evidencia) errores.push(`${r.id} es de verificación manual y no indica evidencia`);
}
for (const k of catalogo.riesgos) {
  if (!catalogo.requisitos.some((r) => r.riesgos.includes(k.id))) errores.push(`${k.id} no está mitigado por ningún requisito`);
}

// Matriz en Markdown
const total = catalogo.requisitos.length;
const conCodigo = catalogo.requisitos.filter((r) => codigo.has(r.id)).length;
const conPrueba = catalogo.requisitos.filter((r) => pruebas.has(r.id)).length;
const manuales = catalogo.requisitos.filter((r) => r.verificacion === "manual").length;
const riesgosCubiertos = catalogo.riesgos.filter((k) => catalogo.requisitos.some((r) => r.riesgos.includes(k.id))).length;

const md: string[] = [
  "# Matriz de trazabilidad (generada)",
  "",
  "> Generada por `npm run trazabilidad` desde `proceso/requisitos.json`, las etiquetas `@req` del código y los IDs en los nombres de las pruebas. No editar a mano.",
  "",
  `- Requisitos con código: **${conCodigo}/${total}**`,
  `- Requisitos con prueba automática: **${conPrueba}/${total}**` + (manuales ? ` (${manuales} con verificación manual documentada)` : ""),
  `- Riesgos con al menos un requisito que los mitiga: **${riesgosCubiertos}/${catalogo.riesgos.length}**`,
  "",
  "## Requisito → riesgo → diseño → código → prueba",
  "",
  "| ID | Requisito | Riesgos | Diseño | Código | Pruebas | Verificación |",
  "| --- | --- | --- | --- | --- | --- | --- |",
  ...catalogo.requisitos.map((r) => {
    const files = [...(codigo.get(r.id) ?? [])].map((f) => `\`${f}\``).join("<br>") || "—";
    const tests = (pruebas.get(r.id) ?? []).map((t) => `${t}`).join("<br>") || "—";
    const ver = r.verificacion === "manual" ? `Manual: ${r.evidencia}` : "Automática";
    return `| ${r.id} | ${r.texto} | ${r.riesgos.join(", ") || "—"} | ${r.diseno} | ${files} | ${tests} | ${ver} |`;
  }),
  "",
  "## Riesgos",
  "",
  "| ID | Riesgo | Probabilidad | Impacto | Requisitos que lo mitigan |",
  "| --- | --- | --- | --- | --- |",
  ...catalogo.riesgos.map((k) => {
    const reqs = catalogo.requisitos.filter((r) => r.riesgos.includes(k.id)).map((r) => r.id).join(", ") || "—";
    return `| ${k.id} | ${k.descripcion} | ${k.probabilidad} | ${k.impacto} | ${reqs} |`;
  }),
  "",
];
writeFileSync(path.join(root, "proceso", "matriz-trazabilidad.md"), md.join("\n"));

console.log(`Requisitos con código: ${conCodigo}/${total} | con prueba automática: ${conPrueba}/${total} | riesgos cubiertos: ${riesgosCubiertos}/${catalogo.riesgos.length}`);
if (errores.length) {
  console.error("\nHuecos de trazabilidad:\n- " + errores.join("\n- "));
  process.exit(1);
}
console.log("Trazabilidad completa. Matriz escrita en proceso/matriz-trazabilidad.md");
