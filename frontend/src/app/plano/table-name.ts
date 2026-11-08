/** Nombre de la mesa para frases: "Mesa 3", o el nombre tal cual si ya empieza por "mesa". */
export function tableName(label: string): string {
  const text = label.trim();
  return /^mesa\b/i.test(text) ? text : `Mesa ${text}`;
}
