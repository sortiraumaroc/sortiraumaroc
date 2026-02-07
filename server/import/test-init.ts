/**
 * Test d'initialisation des connecteurs
 */

import { initializeConnectors } from "./importer";
import { getConnector, getAvailableSources } from "./connectors/base";

console.log("Initializing connectors...");
initializeConnectors();

console.log("Available sources:", getAvailableSources());

const connector = getConnector("sortiraumaroc");
console.log("sortiraumaroc connector found:", !!connector);
console.log("sortiraumaroc enabled:", connector?.config?.enabled);

const googleConnector = getConnector("google");
console.log("google connector found:", !!googleConnector);
