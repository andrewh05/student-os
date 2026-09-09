(() => {
  if (!checkAuth()) return;
  let user = null;
  try { user = JSON.parse(localStorage.getItem('hub_user')); } catch { user = null; }
  const isAdmin = Boolean(user && user.role === 'admin');
  const storageKey = `student_os_kazaa:${user?.id || user?.username || 'user'}`;
  const status = document.querySelector('#kazaaStatus');
  const analyze = document.querySelector('#classifyBtn');
  const saveAll = document.querySelector('#saveAllBtn');
  const exportBtn = document.querySelector('#exportKazaaBtn');
  const exportLabel = document.querySelector('#exportKazaaLabel');
  const filterExportBtn = document.querySelector('#filterExportBtn');
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
    analyze.disabled = busy || !isAdmin || !configured || !records.some(student => student.origin?.trim() && student.origin.length <= 300 && !assignment(student));
    if (!isAdmin) {
      analyze.title = 'Administrator privileges required to run Groq AI analysis';
    } else {
      analyze.title = '';
    }
    if (saveAll) saveAll.disabled = busy || !records.length;
    if (exportBtn) {
      exportBtn.disabled = busy || !records.length;
      if (exportLabel) {
        exportLabel.textContent = filter.value ? `Export ${filter.value}` : 'Export Kazaa';
      }
    }
    if (filterExportBtn) {
      filterExportBtn.disabled = busy || !records.length;
      filterExportBtn.title = filter.value ? `Export ${filter.value} roster` : 'Export Kazaa roster';
    }
    reload.disabled = busy;
  }
  async function load() {
    busy = true;
    if (saveAll) saveAll.disabled = true;
    if (exportBtn) exportBtn.disabled = true;
    if (filterExportBtn) filterExportBtn.disabled = true;
    analyze.disabled = reload.disabled = true;
    status.textContent = 'Loading students…';
    try {
      const response = await fetch(`${API_BASE}/kazaa`, { headers: headers() });
      const json = await parseApiResponse(response);
      if (!response.ok || !json.success) throw new Error(json.error || 'Could not load students.');
      records = json.data;
      districts = json.districts;
      configured = json.configured;
      assignments = {};
      records.forEach(student => {
        if (student.kazaa && districts.includes(student.kazaa)) {
          assignments[student.id] = { origin: student.origin, district: student.kazaa, manual: true };
        }
      });
      save();
      filter.innerHTML = '<option value="">All districts</option><option>Needs review</option>' + districts.map(name => `<option>${escapeHtml(name)}</option>`).join('');
      status.textContent = configured
        ? (isAdmin ? 'Ready. Analyze origins to get AI district suggestions.' : 'Ready. Review students and assign districts below.')
        : 'Groq is not connected yet. Add GROQ_API_KEY in Cloudflare Worker secrets to enable AI. You can assign districts manually now.';
    } catch (err) { status.textContent = err.message; }
    finally { busy = false; render(); }
  }
  analyze.addEventListener('click', async () => {
    if (busy || !isAdmin) return;
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
        const batchUpdates = [];
        records.forEach(student => {
          if (!assignment(student) && byOrigin.has(student.origin)) {
            const suggested = byOrigin.get(student.origin);
            if (suggested) {
              assignments[student.id] = { origin: student.origin, district: suggested, manual: false };
              student.kazaa = suggested;
              batchUpdates.push({ id: student.id, district: suggested });
            }
          }
        });
        completed += batch.length;
        save();
        render();
        if (batchUpdates.length) {
          status.textContent = `Saving ${batchUpdates.length} district suggestions to database…`;
          const saveRes = await fetch(`${API_BASE}/kazaa/batch`, {
            method: 'POST',
            headers: headers(),
            body: JSON.stringify({ assignments: batchUpdates })
          });
          const saveJson = await parseApiResponse(saveRes);
          if (!saveRes.ok || !saveJson.success) throw new Error(saveJson.error || 'Could not save suggestions to database.');
        }
      }
      status.textContent = 'Analysis complete. District suggestions saved to database. Review and adjust any origins manually.';
      save();
    } catch (err) {
      status.textContent = `${err.message} Completed batches have been kept. Click Analyze to retry remaining origins.`;
    } finally { busy = false; render(); }
  });
  document.querySelector('#kazaaStudents').addEventListener('change', async event => {
    const select = event.target.closest('select[data-student-id]');
    if (!select || busy) return;
    const student = records.find(item => String(item.id) === select.dataset.studentId);
    if (!student) return;
    const previous = assignments[student.id];
    const previousKazaa = student.kazaa;
    const newDistrict = select.value;
    if (newDistrict) {
      assignments[student.id] = { origin: student.origin, district: newDistrict, manual: true };
    } else {
      delete assignments[student.id];
    }
    student.kazaa = newDistrict;
    save();
    render();
    status.textContent = 'Saving district to database…';
    try {
      const res = await fetch(`${API_BASE}/students/${encodeURIComponent(student.id)}/kazaa`, {
        method: 'PATCH',
        headers: headers(),
        body: JSON.stringify({ kazaa: newDistrict })
      });
      const json = await parseApiResponse(res);
      if (!res.ok || !json.success) throw new Error(json.error || 'Could not save district.');
      status.textContent = 'District assignment saved to database.';
    } catch (err) {
      if (previous) assignments[student.id] = previous;
      else delete assignments[student.id];
      student.kazaa = previousKazaa || '';
      save();
      render();
      status.textContent = `Error: ${err.message}`;
    }
  });
  if (saveAll) {
    saveAll.addEventListener('click', async () => {
      if (busy || !records.length) return;
      busy = true;
      render();

      const toSave = records
        .filter(student => assignment(student)?.district)
        .map(student => ({ id: student.id, district: assignment(student).district }));

      const unassignedToClear = records
        .filter(student => !assignment(student)?.district && student.kazaa)
        .map(student => ({ id: student.id, district: '' }));

      const allChanges = [...toSave, ...unassignedToClear];

      if (!allChanges.length) {
        status.textContent = 'No district assignments to save. Assign districts to students first or analyze with Groq.';
        busy = false;
        render();
        return;
      }

      const label = document.querySelector('#saveAllLabel');
      if (label) label.textContent = 'Saving to database…';
      status.textContent = `Saving ${allChanges.length} district assignments to database…`;

      const batchSize = 25;
      let savedCount = 0;
      try {
        for (let i = 0; i < allChanges.length; i += batchSize) {
          const batch = allChanges.slice(i, i + batchSize);
          status.textContent = `Saving to database: ${savedCount} of ${allChanges.length}…`;
          const response = await fetch(`${API_BASE}/kazaa/batch`, {
            method: 'POST',
            headers: headers(),
            body: JSON.stringify({ assignments: batch })
          });
          const json = await parseApiResponse(response);
          if (!response.ok || !json.success) throw new Error(json.error || 'Could not save assignments to database.');
          savedCount += batch.length;
        }

        toSave.forEach(item => {
          const student = records.find(s => String(s.id) === String(item.id));
          if (student) student.kazaa = item.district;
        });
        unassignedToClear.forEach(item => {
          const student = records.find(s => String(s.id) === String(item.id));
          if (student) student.kazaa = '';
        });
        save();
        render();
        status.textContent = `Successfully saved ${toSave.length} student district assignments to the database.`;
        if (typeof showToast === 'function') {
          showToast('Saved to database', `${toSave.length} student district assignments have been saved to Supabase.`);
        }
      } catch (err) {
        status.textContent = `Error: ${err.message} (${savedCount} saved before error)`;
        if (typeof showToast === 'function') {
          showToast('Save failed', err.message);
        }
      } finally {
        busy = false;
        if (label) label.textContent = 'Save all to database';
        render();
      }
    });
  }

  // Export by Kazaa
  const exportModal = document.querySelector('#kazaaExportModal');
  const closeExportModal = document.querySelector('#closeExportModal');
  const exportDistrictSelect = document.querySelector('#exportDistrictSelect');
  const modalOpenReportBtn = document.querySelector('#modalOpenReportBtn');
  const modalDownloadCsvBtn = document.querySelector('#modalDownloadCsvBtn');
  const modalStatTotal = document.querySelector('#modalStatTotal');
  const modalStatInGroup = document.querySelector('#modalStatInGroup');
  const modalStatTowns = document.querySelector('#modalStatTowns');

  let fullStudentsCache = null;
  async function getFullStudents() {
    if (fullStudentsCache) return fullStudentsCache;
    try {
      const res = await fetch(`${API_BASE}/students`, { headers: headers() });
      const json = await parseApiResponse(res);
      if (json.success && Array.isArray(json.data)) {
        fullStudentsCache = json.data;
        return fullStudentsCache;
      }
    } catch (err) {
      console.warn('Could not fetch full students roster:', err);
    }
    return records;
  }

  function getDistrictForStudent(student) {
    const assigned = assignment(student);
    if (assigned && assigned.district) return assigned.district;
    return student.kazaa || 'Needs review';
  }

  function updateModalStats(districtName) {
    const matching = records.filter(s => getDistrictForStudent(s) === districtName);
    const inGroup = matching.filter(s => {
      const full = fullStudentsCache?.find(fs => String(fs.id) === String(s.id));
      return full ? full.inGroup : false;
    }).length;
    const towns = new Set(matching.map(s => s.origin?.trim()).filter(Boolean)).size;

    if (modalStatTotal) modalStatTotal.textContent = matching.length;
    if (modalStatInGroup) modalStatInGroup.textContent = inGroup;
    if (modalStatTowns) modalStatTowns.textContent = towns;
  }

  function openExportDialog(preferredDistrict = '') {
    if (!records.length || !exportModal) return;

    // Pre-warm full students cache
    getFullStudents();

    // Collect all districts that currently have students
    const counts = {};
    records.forEach(s => {
      const d = getDistrictForStudent(s);
      counts[d] = (counts[d] || 0) + 1;
    });

    const populatedDistricts = Object.keys(counts).sort((a, b) => {
      if (a === 'Needs review') return 1;
      if (b === 'Needs review') return -1;
      return a.localeCompare(b);
    });

    if (!populatedDistricts.length) {
      alert('No students available to export.');
      return;
    }

    exportDistrictSelect.innerHTML = populatedDistricts.map(d =>
      `<option value="${escapeHtml(d)}">${escapeHtml(d)} (${counts[d]} students)</option>`
    ).join('');

    const target = preferredDistrict && counts[preferredDistrict] ? preferredDistrict : populatedDistricts[0];
    exportDistrictSelect.value = target;
    updateModalStats(target);

    exportModal.showModal();
  }

  async function downloadDistrictCsv(districtName) {
    if (!districtName) return;
    status.textContent = `Preparing CSV export for ${districtName}…`;
    const fullList = await getFullStudents();

    const matched = records.filter(s => getDistrictForStudent(s) === districtName);
    if (!matched.length) {
      status.textContent = `No students found for ${districtName}.`;
      return;
    }

    const fullMap = new Map(fullList.map(s => [String(s.id), s]));

    const headersList = [
      'ID',
      'First Name',
      'Father Name',
      'Family Name',
      'Full Name',
      'Origin (Town/Village)',
      'Kazaa (District)',
      'Phone',
      'Email',
      'Address',
      'School/Faculty',
      'Major',
      'Campus',
      'Language',
      'Status',
      'Political Affiliation',
      'In Group',
      'Left Group',
      'Note',
      'Created At'
    ];

    const rows = matched.map(rec => {
      const full = fullMap.get(String(rec.id)) || rec;
      const fName = full.firstName || rec.firstName || '';
      const father = full.fatherName || '';
      const famName = full.familyName || rec.familyName || '';
      const fullName = [fName, father, famName].filter(Boolean).join(' ');

      return [
        full.id || rec.id,
        fName,
        father,
        famName,
        fullName,
        rec.origin || full.origin || '',
        districtName,
        full.phone || '',
        full.email || '',
        full.address || '',
        full.school || '',
        full.major || '',
        full.campus || '',
        full.language || '',
        full.status || '',
        full.politicalAffiliation || '',
        full.inGroup ? 'Yes' : 'No',
        full.leftGroup ? 'Yes' : 'No',
        full.note || '',
        full.createdAt || ''
      ];
    });

    const csvString = [
      headersList.join(','),
      ...rows.map(row => row.map(v => `"${String(v ?? '').replaceAll('"', '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    const slug = districtName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    link.download = `student-os-kazaa-${slug}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);

    status.textContent = `Exported ${rows.length} students from ${districtName} to CSV.`;
    if (typeof showToast === 'function') {
      showToast('CSV Exported', `Downloaded full roster for ${districtName} (${rows.length} students).`);
    }
  }

  if (exportBtn) {
    exportBtn.addEventListener('click', () => openExportDialog(filter.value));
  }
  if (filterExportBtn) {
    filterExportBtn.addEventListener('click', () => openExportDialog(filter.value));
  }
  if (closeExportModal && exportModal) {
    closeExportModal.addEventListener('click', () => exportModal.close());
    exportModal.addEventListener('click', e => { if (e.target === exportModal) exportModal.close(); });
  }
  if (exportDistrictSelect) {
    exportDistrictSelect.addEventListener('change', () => updateModalStats(exportDistrictSelect.value));
  }
  if (modalOpenReportBtn) {
    modalOpenReportBtn.addEventListener('click', () => {
      const selected = exportDistrictSelect?.value;
      if (!selected) return;
      if (exportModal) exportModal.close();
      window.open(`kazaa-export.html?district=${encodeURIComponent(selected)}`, '_blank');
    });
  }
  if (modalDownloadCsvBtn) {
    modalDownloadCsvBtn.addEventListener('click', () => {
      const selected = exportDistrictSelect?.value;
      if (!selected) return;
      if (exportModal) exportModal.close();
      downloadDistrictCsv(selected);
    });
  }

  document.querySelector('#kazaaCounts').addEventListener('click', event => {
    const button = event.target.closest('[data-district]');
    if (button) {
      filter.value = filter.value === button.dataset.district ? '' : button.dataset.district;
      render();
    }
  });

  filter.addEventListener('change', render);
  search.addEventListener('input', render);
  reload.addEventListener('click', load);
  load();
})();

