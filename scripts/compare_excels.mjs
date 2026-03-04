import ExcelJS from "exceljs";

async function main() {
  // Read MAJ
  const wbMaj = new ExcelJS.Workbook();
  await wbMaj.xlsx.readFile("/Users/salaheddineaitnasser/Downloads/Ftour_Sortir_Au_Maroc_2026_MAJ.xlsx");
  const wsMaj = wbMaj.worksheets[0];
  const majNames = new Set();
  const majEntries = [];
  wsMaj.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      const name = (row.getCell(1).text || "").trim();
      const city = (row.getCell(3).text || "").trim();
      if (name) {
        majNames.add(name.toLowerCase());
        majEntries.push({ name, city });
      }
    }
  });

  // Read FINAL
  const wbFinal = new ExcelJS.Workbook();
  await wbFinal.xlsx.readFile("/Users/salaheddineaitnasser/Downloads/Ftour_Sortir_Au_Maroc_2026_FINAL.xlsx");
  const wsFinal = wbFinal.worksheets[0];
  const finalNames = new Set();
  const finalEntries = [];
  wsFinal.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      const name = (row.getCell(1).text || "").trim();
      const type = (row.getCell(2).text || "").trim();
      const city = (row.getCell(3).text || "").trim();
      const price = (row.getCell(5).text || "").trim();
      if (name) {
        finalNames.add(name.toLowerCase());
        finalEntries.push({ name, type, city, price });
      }
    }
  });

  console.log("MAJ entries:", majNames.size);
  console.log("FINAL entries:", finalNames.size);

  // Find entries in FINAL but NOT in MAJ
  const onlyInFinal = finalEntries.filter(
    (e) => !majNames.has(e.name.toLowerCase()),
  );
  // Find entries in MAJ but NOT in FINAL
  const onlyInMaj = majEntries.filter(
    (e) => !finalNames.has(e.name.toLowerCase()),
  );

  console.log();
  console.log("Dans FINAL mais PAS dans MAJ:", onlyInFinal.length);
  for (const e of onlyInFinal) {
    console.log("  +", e.name, "(" + e.city + ")", "-", e.price);
  }

  console.log();
  console.log("Dans MAJ mais PAS dans FINAL:", onlyInMaj.length);
  for (const e of onlyInMaj) {
    console.log("  -", e.name, "(" + e.city + ")");
  }

  console.log();
  console.log("Communs:", majNames.size - onlyInMaj.length);
}
main().catch(console.error);
