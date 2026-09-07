(() => {
  if (!checkAuth()) return;
  const user = JSON.parse(localStorage.getItem('hub_user'));
  const storageKey = `student_os_kazaa:${user.id || user.username}`;
  const status = document.querySelector('#kazaaStatus');
  const analyze = document.querySelector('#classifyBtn');
  const reload = document.querySelector('#reloadKazaa');
  const filter = document.querySelector('#kazaaFilter');
  const search = document.querySelector('#kazaaSearch');
  let records = [], districts = [], assignments = {}, configured = false, busy = false;
  try { assignments = JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch { assignments = {}; }
  if (!assignments || typeof assignments !== 'object' || Array.isArray(assignments)) assignments = {};
  const headers = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('hub_token') || ''}` });
  const assignment = student => {
    const saved = assignments[student.id];
    return saved && saved.origin === student.origin && districts.includes(saved.district) ? saved : null;
  };
  function save() {
    try { localStorage.setItem(storageKey, JSON.stringify(assignments)); }
    catch { status.textContent = 'Browser storage is unavailable. These assignments will last only until you leave this page.'; }
  }
  function render() {
    const counts = Object.fromEntries([...districts, 'Needs review'].map(name => [name, 0]));
    records.forEach(student => counts[assignment(student)?.district || 'Needs review']++);
    const assigned = records.length - counts['Needs review'];
    document.querySelector('#kazaaSummary').textContent = `${records.length} students · ${assigned} assigned · ${counts['Needs review']} need review`;
    document.querySelector('#kazaaCounts').innerHTML = Object.entries(counts).map(([name,count]) => `<button type="button" class="kazaa-count" data-district="${escapeHtml(name)}" aria-pressed="${filter.value === name}"><span>${escapeHtml(name)}</span><strong>${count}</strong></button>`).join('');
    const needle = search.value.trim().toLocaleLowerCase();
    const visible = records.filter(student => (!filter.value || (assignment(student)?.district || 'Needs review') === filter.value) && `${student.firstName} ${student.familyName} ${student.origin}`.toLocaleLowerCase().includes(needle));
    document.querySelector('#kazaaStudents').innerHTML = visible.length ? visible.map(student => {
      const current = assignment(student);
      return `<article class="kazaa-student">
        <div><a href="form.html?edit=${encodeURIComponent(student.id)}">${escapeHtml(student.firstName)} ${escapeHtml(student.familyName)}</a><p>Origin: ${escapeHtml(student.origin || 'Not provided')}</p><small>${current ? (current.manual ? 'Manually assigned' : 'AI suggestion — please review') : 'Needs review'}</small></div>
        <label><span>Kazaa</span><select data-student-id="${escapeHtml(student.id)}" ${busy ? 'disabled' : ''} aria-label="Kazaa for ${escapeHtml(student.firstName)} ${escapeHtml(student.familyName)}"><option value="">Needs review</option>${districts.map(district => `<option ${current?.district === district ? 'selected' : ''}>${escapeHtml(district)}</option>`).join('')}</select></label>
      </article>`;
    }).join('') : '<p class="kazaa-empty">No students match this view.</p>';
    analyze.disabled = busy || !configured || !records.some(student => student.origin?.trim() && student.origin.length <= 300 && !assignment(student));
    reload.disabled = busy;
  }
  async function load() {
    busy = true;
    analyze.disabled = reload.disabled = true;
    status.textContent = 'Loading students…';
    try {
      const response = await fetch(`${API_BASE}/kazaa`, { headers: headers() });
      const json = await parseApiResponse(response);
      if (!response.ok || !json.success) throw new Error(json.error || 'Could not load students.');
      records = json.data;
      districts = json.districts;
      configured = json.configured;
      filter.innerHTML = '<option value="">All districts</option><option>Needs review</option>' + districts.map(name => `<option>${escapeHtml(name)}</option>`).join('');
      status.textContent = configured ? 'Ready. Analyze origins to get AI district suggestions.' : 'Groq is not connected yet. Add GROQ_API_KEY in Cloudflare Worker secrets to enable AI. You can assign districts manually now.';
    } catch (err) { status.textContent = err.message; }
    finally { busy = false; render(); }
  }
  analyze.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    render();
    const pending = [...new Set(records.filter(student => !assignment(student) && student.origin?.trim() && student.origin.length <= 300).map(student => student.origin))];
    let completed = 0;
    try {
      for (let start = 0; start < pending.length; start += 30) {
        status.textContent = `Analyzing origins: ${completed} of ${pending.length}…`;
        const batch = pending.slice(start, start + 30);
        const response = await fetch(`${API_BASE}/kazaa/classify`, { method: 'POST', headers: headers(), body: JSON.stringify({ origins: batch }) });
        const json = await parseApiResponse(response);
        if (!response.ok || !json.success) throw new Error(json.error || 'Could not analyze origins.');
        const byOrigin = new Map(batch.map((origin, index) => [origin, json.data[index].district]));
        records.forEach(student => {
          if (!assignment(student) && byOrigin.has(student.origin)) {
            assignments[student.id] = { origin: student.origin, district: byOrigin.get(student.origin), manual: false };
          }
        });
        completed += batch.length;
        save();
        render();
      }
      status.textContent = 'Analysis complete. Review AI suggestions and assign unclear origins manually.';
      save();
    } catch (err) {
      status.textContent = `${err.message} Completed batches have been kept. Click Analyze to retry remaining origins.`;
    } finally { busy = false; render(); }
  });
  document.querySelector('#kazaaStudents').addEventListener('change', event => {
    const select = event.target.closest('select[data-student-id]');
    if (!select || busy) return;
    const student = records.find(item => String(item.id) === select.dataset.studentId);
    if (!student) return;
    assignments[student.id] = { origin: student.origin, district: select.value, manual: true };
    status.textContent = 'District assignment updated.';
    save();
    render();
  });
  document.querySelector('#kazaaCounts').addEventListener('click', event => {
    const button = event.target.closest('[data-district]');
    if (button) { filter.value = filter.value === button.dataset.district ? '' : button.dataset.district; render(); }
  });
  filter.addEventListener('change', render);
  search.addEventListener('input', render);
  reload.addEventListener('click', load);
  load();
})();
