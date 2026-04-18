// AE Estimates — Main application shell
// Shared plumbing: tab navigation, project export/import.
// Tab modules live in se-estimate.js and ae-estimate.js.

const estimateTypes = {
  'se': {
    label: 'SE Estimate',
    module: () => window.seEstimate,
  },
  'ae': {
    label: 'A/E Estimate',
    module: () => window.aeEstimate,
  },
};

let currentTab = 'se';

document.getElementById('estimate-nav').addEventListener('click', (e) => {
  if (!e.target.matches('.nav-btn')) return;
  const type = e.target.dataset.type;
  if (!estimateTypes[type] || type === currentTab) return;

  // Capture any unsaved form edits on the outgoing tab before re-rendering.
  const outgoing = estimateTypes[currentTab].module();
  if (outgoing && outgoing.saveForm) outgoing.saveForm();

  document.querySelectorAll('.nav-btn').forEach((btn) => btn.classList.remove('active'));
  e.target.classList.add('active');
  currentTab = type;
  estimateTypes[type].module().render();
});

function activateTab(tabId) {
  if (!estimateTypes[tabId]) return;
  currentTab = tabId;
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.type === tabId);
  });
  estimateTypes[tabId].module().render();
}

// ---------- Project Export / Import (v2 envelope covers both tabs) ----------

async function exportProject() {
  const activeModule = estimateTypes[currentTab].module();
  const name = (activeModule.getProjectName && activeModule.getProjectName()) || 'Untitled Project';
  const safeName = name.replace(/[^a-zA-Z0-9 _\-]/g, '');

  const wrapper = {
    version: 2,
    name: name,
    date: new Date().toISOString(),
    tab: currentTab,
    seState: window.seEstimate ? window.seEstimate.getState() : null,
    aeState: window.aeEstimate ? window.aeEstimate.getState() : null,
  };

  const json = JSON.stringify(wrapper, null, 2);
  const blob = new Blob([json], { type: 'application/json' });

  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: safeName + ' - Estimate.json',
        types: [{ description: 'JSON File', accept: { 'application/json': ['.json'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safeName + ' - Estimate.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function importProject() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';

  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const wrapper = JSON.parse(reader.result);
        const version = wrapper.version;

        if (version === 2) {
          if (wrapper.seState && window.seEstimate) {
            window.seEstimate.setState(wrapper.seState);
          }
          if (wrapper.aeState && window.aeEstimate) {
            window.aeEstimate.setState(wrapper.aeState);
          }
          const targetTab = wrapper.tab && estimateTypes[wrapper.tab] ? wrapper.tab : 'se';
          activateTab(targetTab);
          return;
        }

        // v1: { version: 1, state: { ...SE state... } }  (or bare SE state)
        const seState = wrapper.state || wrapper;
        if (typeof seState.stories !== 'number') {
          alert('This file does not appear to be a valid estimate.');
          return;
        }
        window.seEstimate.setState(seState);
        activateTab('se');
      } catch (e) {
        alert('Could not read file: ' + e.message);
      }
    };
    reader.readAsText(file);
  });

  input.click();
}

window.exportProject = exportProject;
window.importProject = importProject;

// ---------- Initial render ----------

estimateTypes[currentTab].module().render();
