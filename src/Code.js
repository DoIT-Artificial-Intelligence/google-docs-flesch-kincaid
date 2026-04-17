/**
 * Server-side Apps Script functions for the Google Docs Add-on.
 */

function onInstall(e) {
  onOpen(e);
}

function onOpen(e) {
  DocumentApp.getUi()
    .createAddonMenu()
    .addItem('Show Sidebar', 'showSidebar')
    .addToUi();
}

function showSidebar() {
  const html = HtmlService.createTemplateFromFile('Sidebar')
    .evaluate()
    .setTitle('Flesch-Kincaid Readability')
    .setWidth(300);
  DocumentApp.getUi().showSidebar(html);
}

/**
 * Wrapper for the calculation logic to be called from the sidebar.
 */
function calculateStats() {
  return getReadabilityStats();
}
