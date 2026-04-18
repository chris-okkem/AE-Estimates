// A/E Estimate — Architecture + Engineering full-scope fee estimate module

(function () {
  const app = document.getElementById('app');

  let state = makeInitialState();

  function makeInitialState() {
    return {
      identity: { projectName: '', clientName: '', projectType: 'new' },
    };
  }

  function render() {
    app.innerHTML = `
      <div class="estimate-form">
        <div class="form-header">
          <h2>A/E Estimate</h2>
        </div>
        <div class="form-section">
          <p class="help-text">The A/E full-scope estimator is coming in the next phase. This tab will produce phase-by-phase architectural and engineering fee estimates.</p>
        </div>
      </div>
    `;
  }

  function saveForm() {
    // No form inputs in the stub; Phase 2 will fill this in.
  }

  window.aeEstimate = {
    render,
    saveForm,
    getState: () => state,
    getProjectName: () => state.identity.projectName || '',
    setState: (newState) => { state = newState; render(); },
    reset: () => { state = makeInitialState(); render(); },
  };
})();
