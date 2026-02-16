/**
 * geneRelate — Main Application Logic
 * Static bioinformatics tool for Fusarium cross-species analysis.
 * All data loaded from pre-downloaded JSON files. No API calls.
 */

// ===== State =====
const state = {
    speciesList: [],
    metadata: null,
    cache: {},        // taxid -> { aliases, nameLookup, ppi, info, go, kegg, keggPathways, otherTerms, genePatterns }
    sourceSpecies: null,
    targetSpecies: [],
    genes: [],
    scoreThreshold: 700,
    goEnrichmentResults: null,
    keggEnrichmentResults: null,
    enrichmentPlotType: 'bar',
    phylogenyData: null,
};
window.state = state;

// ===== DOM Elements =====
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const els = {
    sourceSelect: $('#source-species'),
    geneInput: $('#gene-input'),
    autoDetectHint: $('#auto-detect-hint'),
    targetList: $('#target-species-list'),
    scoreSlider: $('#score-threshold'),
    scoreValue: $('#score-value-input'),
    analyzeBtn: $('#analyze-btn'),
    resultsPlaceholder: $('#results-placeholder'),
    resultsContent: $('#results-content'),
    loadingOverlay: $('#loading-overlay'),
    loadingText: $('#loading-text'),
    themeToggle: $('#theme-toggle'),
    aboutBtn: $('#about-btn'),
    dbModal: $('#db-modal'),
    dbVersionList: $('#db-version-list'),
};

// ===== Data Loading =====
async function fetchJSON(path) {
    try {
        const resp = await fetch(path);
        if (!resp.ok) {
            console.warn(`Failed to load ${path}: HTTP ${resp.status}`);
            return null;
        }
        return await resp.json();
    } catch (err) {
        console.warn(`Failed to load ${path}:`, err);
        return null;
    }
}

async function loadSpeciesData(taxid) {
    if (state.cache[taxid]) return state.cache[taxid];
    showLoading(`Loading ${getSpeciesName(taxid)} data...`);

    const base = `data/${taxid}`;
    const [aliases, nameLookup, ppi, info, go, kegg, keggPathways, otherTerms] = await Promise.all([
        fetchJSON(`${base}/aliases.json`),
        fetchJSON(`${base}/name_lookup.json`),
        fetchJSON(`${base}/ppi.json`),
        fetchJSON(`${base}/info.json`),
        fetchJSON(`${base}/go.json`),
        fetchJSON(`${base}/kegg_enrichment.json`),
        fetchJSON(`${base}/kegg_pathways.json`),
        fetchJSON(`${base}/other_terms.json`),
    ]);

    state.cache[taxid] = {
        aliases: aliases || {},
        nameLookup: nameLookup || {},
        ppi: ppi || {},
        info: info || {},
        go: go || {},
        kegg: kegg || {},
        keggPathways: keggPathways || { pathways: {}, gene_pathways: {} },
        otherTerms: otherTerms || {},
    };
    return state.cache[taxid];
}

function getSpeciesName(taxid) {
    const sp = state.speciesList.find(s => s.taxid === taxid);
    return sp ? sp.compact_name : taxid;
}

/** Wrap species name with italic genus (first word italic, rest normal) for HTML */
function italicSpeciesName(name) {
    const parts = name.split(' ');
    if (parts.length >= 2) {
        return `<em>${esc(parts[0])}</em> ${esc(parts.slice(1).join(' '))}`;
    }
    return `<em>${esc(name)}</em>`;
}



// ===== Gene Resolution =====
function resolveGene(geneName, taxid) {
    const data = state.cache[taxid];
    if (!data || !data.nameLookup) return null;
    const key = geneName.toLowerCase().trim();
    const matches = data.nameLookup[key];
    if (matches && matches.length > 0) return matches[0];

    if (data.aliases && data.aliases[geneName]) return geneName;
    if (data.info && data.info[geneName]) return geneName;

    return null;
}

function getPreferredName(proteinId, taxid) {
    const data = state.cache[taxid];
    if (data && data.info && data.info[proteinId]) {
        return data.info[proteinId].name || proteinId;
    }
    return proteinId;
}

// ===== Auto-Detection =====

/**
 * Attempt to detect species from input gene names using regex patterns.
 * e.g. FGSG_ -> F. graminearum, FVEG_ -> F. verticillioides
 */
function detectSpeciesFromInput(input) {
    input = input.trim();
    if (!input) return null;

    const geneSample = input.split(/[,\n\r\s]+/).filter(Boolean).slice(0, 5);
    if (geneSample.length === 0) return null;

    // Common Fusarium gene prefixes (inferred)
    const patterns = [
        { regex: /^FGSG_/i, taxid: '229533' },   // F. graminearum
        { regex: /^FVEG_/i, taxid: '334819' },   // F. verticillioides
        { regex: /^FOXG_/i, taxid: '426428' },   // F. oxysporum f. sp. lycopersici
        { regex: /^FOXB_/i, taxid: '556157' },   // F. oxysporum Fo5176 (often similar)
        { regex: /^FFUJ_/i, taxid: '1279085' },  // F. fujikuroi
        { regex: /^FPSE_/i, taxid: '1028729' },  // F. pseudograminearum
        { regex: /^FCUL_/i, taxid: '5516' },     // F. culmorum
    ];

    // Check each gene against patterns
    const counts = {};
    const availableTaxids = new Set(state.speciesList.map(s => s.taxid));

    for (const gene of geneSample) {
        for (const p of patterns) {
            if (p.regex.test(gene) && availableTaxids.has(p.taxid)) {
                counts[p.taxid] = (counts[p.taxid] || 0) + 1;
            }
        }
    }

    // Find best match
    let bestTaxid = null;
    let maxCount = 0;
    for (const [taxid, count] of Object.entries(counts)) {
        if (count > maxCount) {
            maxCount = count;
            bestTaxid = taxid;
        }
    }

    return bestTaxid; // taxid or null
}

function updateAutoDetectHint() {
    const text = els.geneInput.value;
    const detectedTaxid = detectSpeciesFromInput(text);

    if (detectedTaxid && detectedTaxid !== els.sourceSelect.value) {
        const spName = getSpeciesName(detectedTaxid);
        els.autoDetectHint.innerHTML = `Did you mean ${italicSpeciesName(spName)}? Click to switch.`;
        els.autoDetectHint.hidden = false;
        els.autoDetectHint.onclick = () => {
            els.sourceSelect.value = detectedTaxid;
            els.autoDetectHint.hidden = true;
            // flash effect
            els.sourceSelect.style.backgroundColor = 'var(--bg-hover)';
            setTimeout(() => els.sourceSelect.style.backgroundColor = '', 300);
        };
    } else {
        els.autoDetectHint.hidden = true;
    }
}


// ===== Helpers =====
function esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function truncate(str, max) {
    if (!str) return '';
    if (str.length <= max) return str;
    return str.slice(0, Math.max(0, max - 1)) + '…';
}

function notFoundSummary(resolvedGenes) {
    const missing = resolvedGenes.filter(g => !g.proteinId).map(g => g.query);
    if (missing.length === 0) return '';
    return `<div class="not-found-summary">Not found in source species: ${esc(missing.join(', '))}</div>`;
}

// ===== Lazy Phylogeny Loading =====
async function loadPhylogenyData() {
    if (state.phylogenyData) return state.phylogenyData;
    if (state._phyloLoadFailed) return null;

    const [orthogroups, trees, meta] = await Promise.all([
        fetchJSON('data/phylogeny/orthogroups.json'),
        fetchJSON('data/phylogeny/trees.json'),
        fetchJSON('data/phylogeny/metadata.json'),
    ]);

    if (orthogroups && trees) {
        state.phylogenyData = { orthogroups, trees, metadata: meta };
        renderDBVersions();
        return state.phylogenyData;
    }

    state._phyloLoadFailed = true;
    return null;
}

// ===== Analysis =====
async function runAnalysis() {
    const sourceTaxid = els.sourceSelect.value;
    if (!sourceTaxid) return alert('Please select a source species.');

    let genes = [];
    const rawGenes = els.geneInput.value.trim();
    if (!rawGenes) return alert('Please enter at least one gene name.');
    genes = rawGenes.split(/[,\n\r]+/).map(g => g.trim()).filter(Boolean);

    if (genes.length === 0) return alert('Please enter valid gene names.');

    const targetTaxids = [...$$('#target-species-list input:checked')].map(cb => cb.value);

    state.sourceSpecies = sourceTaxid;
    state.genes = genes;
    state.targetSpecies = targetTaxids;
    state.scoreThreshold = parseInt(els.scoreSlider.value);

    try {
        showLoading('Loading source species data...');
        await loadSpeciesData(sourceTaxid);

        for (let i = 0; i < targetTaxids.length; i++) {
            showLoading(`Loading target species ${i + 1}/${targetTaxids.length}...`);
            await loadSpeciesData(targetTaxids[i]);
        }

        const resolvedGenes = genes.map(gene => ({
            query: gene,
            proteinId: resolveGene(gene, sourceTaxid),
        }));

        showLoading('Building results...');
        await new Promise(r => setTimeout(r, 50));

        buildAliasResults(resolvedGenes, sourceTaxid, targetTaxids);
        buildPPIResults(resolvedGenes, sourceTaxid);
        buildPPINetwork(resolvedGenes, sourceTaxid);
        buildGOResults(resolvedGenes, sourceTaxid);
        buildKEGGResults(resolvedGenes, sourceTaxid);

        // Enrichment analyses
        showLoading('Running enrichment analysis...');
        await new Promise(r => setTimeout(r, 50));

        const foundIds = resolvedGenes.filter(g => g.proteinId).map(g => g.proteinId);
        const data = state.cache[sourceTaxid];

        // GO Enrichment
        const goResult = window.Enrichment.runGOEnrichment(foundIds, data.go);
        state.goEnrichmentResults = goResult;
        buildEnrichmentTab('go', goResult, sourceTaxid);

        // KEGG Enrichment
        const keggResult = window.Enrichment.runKEGGEnrichment(foundIds, data.keggPathways, data.aliases, data.info);
        state.keggEnrichmentResults = keggResult;
        buildEnrichmentTab('kegg', keggResult, sourceTaxid);

        // Phylogeny (lazy-load data on first use)
        showLoading('Loading phylogeny data...');
        await loadPhylogenyData();
        window.Phylogeny.buildPhylogenyTab(resolvedGenes, sourceTaxid, targetTaxids, state.phylogenyData);

        hideLoading();
        els.resultsPlaceholder.hidden = true;
        els.resultsContent.hidden = false;
        switchTab('aliases');
    } catch (err) {
        hideLoading();
        console.error('Analysis error:', err);
        alert('Analysis failed: ' + err.message);
    }
}

// ===== Alias Results =====
function buildAliasResults(resolvedGenes, sourceTaxid, targetTaxids) {
    const container = $('#tab-aliases');
    if (targetTaxids.length === 0) {
        container.innerHTML = '<p class="no-data">Select at least one target species to find cross-species aliases.</p>';
        return;
    }

    const found = resolvedGenes.filter(g => g.proteinId);
    let html = '';

    for (const { query, proteinId } of found) {
        html += `<div class="result-section">`;
        html += `<div class="result-section-title"><span class="result-gene-badge">${esc(query)}</span>`;
        const name = getPreferredName(proteinId, sourceTaxid);
        if (name !== query) html += ` → ${esc(name)}`;
        html += `</div>`;

        const sourceData = state.cache[sourceTaxid];
        const sourceAliases = sourceData.aliases?.[proteinId] || [];
        const searchTerms = new Set(sourceAliases.map(a => a.toLowerCase()));
        searchTerms.add(proteinId.toLowerCase());
        const prefName = getPreferredName(proteinId, sourceTaxid);
        if (prefName) searchTerms.add(prefName.toLowerCase());

        html += `<div class="table-responsive"><table class="result-table"><thead><tr>
      <th>Target Species</th><th>Matching Protein</th><th>Preferred Name</th><th>Aliases</th>
    </tr></thead><tbody>`;

        for (const targetTaxid of targetTaxids) {
            if (targetTaxid === sourceTaxid) continue;
            const targetData = state.cache[targetTaxid];
            if (!targetData || !targetData.nameLookup) continue;

            const targetName = getSpeciesName(targetTaxid);
            let foundMatch = false;

            for (const term of searchTerms) {
                const matches = targetData.nameLookup[term];
                if (matches && matches.length > 0) {
                    for (const matchPid of matches.slice(0, 3)) {
                        const matchName = getPreferredName(matchPid, targetTaxid);
                        const matchAliases = (targetData.aliases?.[matchPid] || []).slice(0, 5).join(', ');
                        html += `<tr>
              <td>${italicSpeciesName(targetName)}</td>
              <td><code>${esc(matchPid)}</code></td>
              <td>${esc(matchName)}</td>
              <td class="alias-text">${esc(matchAliases)}</td>
            </tr>`;
                        foundMatch = true;
                    }
                    break;
                }
            }

            if (!foundMatch) {
                html += `<tr><td>${italicSpeciesName(targetName)}</td><td colspan="3" class="gene-not-found">No matching alias found</td></tr>`;
            }
        }

        html += `</tbody></table></div></div>`;
    }

    html += notFoundSummary(resolvedGenes);
    container.innerHTML = html || '<p class="no-data">No alias results.</p>';
    container.querySelectorAll('table').forEach(makeTableSortable);
}

// ===== PPI Results =====
function buildPPIResults(resolvedGenes, sourceTaxid) {
    const container = $('#tab-ppi');
    const data = state.cache[sourceTaxid];
    if (!data || !data.ppi) {
        container.innerHTML = '<p class="no-data">No PPI data available for this species.</p>';
        return;
    }

    const found = resolvedGenes.filter(g => g.proteinId);
    let html = '';

    for (const { query, proteinId } of found) {
        html += `<div class="result-section">`;
        html += `<div class="result-section-title"><span class="result-gene-badge">${esc(query)}</span>`;
        const name = getPreferredName(proteinId, sourceTaxid);
        if (name !== query) html += ` → ${esc(name)}`;
        html += `</div>`;

        if (!data.ppi[proteinId]) {
            html += `<p class="gene-not-found">No interactions found.</p></div>`;
            continue;
        }

        const interactions = data.ppi[proteinId]
            .filter(i => i.s >= state.scoreThreshold)
            .sort((a, b) => b.s - a.s)
            .slice(0, 30);

        if (interactions.length === 0) {
            html += `<p class="gene-not-found">No interactions above score threshold ${state.scoreThreshold}.</p></div>`;
            continue;
        }

        html += `<div class="table-responsive"><table class="result-table"><thead><tr>
      <th>Interactor</th><th>Preferred Name</th><th>Score</th><th>Annotation</th>
    </tr></thead><tbody>`;

        for (const { p, s } of interactions) {
            const iName = getPreferredName(p, sourceTaxid);
            const scoreClass = s >= 900 ? 'score-high' : s >= 700 ? 'score-med' : 'score-low';
            const annotation = data.info?.[p]?.annotation || '';
            html += `<tr>
        <td><code>${esc(p)}</code></td>
        <td>${esc(iName)}</td>
        <td><span class="score ${scoreClass}">${s}</span></td>
        <td class="alias-text">${esc(truncate(annotation, 100))}</td>
      </tr>`;
        }

        html += `</tbody></table></div></div>`;
    }

    html += notFoundSummary(resolvedGenes);
    container.innerHTML = html || '<p class="no-data">No PPI results.</p>';
    container.querySelectorAll('table').forEach(makeTableSortable);
}

// ===== PPI Network Visualization =====
function buildPPINetwork(resolvedGenes, sourceTaxid) {
    const container = $('#ppi-network-plot');
    const data = state.cache[sourceTaxid];

    if (!data || !data.ppi) {
        container.innerHTML = '<p class="no-data">No PPI data.</p>';
        return;
    }

    const getNameFn = (pid) => getPreferredName(pid, sourceTaxid);

    const result = window.PPINetwork.buildPPINetworkSVG(resolvedGenes, data.ppi, data.info, state.scoreThreshold, getNameFn);

    container.innerHTML = '';
    if (result && result.svg) {
        container.appendChild(result.svg);

        // Render Hub Genes Table
        renderHubGenesTable(result.nodes, container, sourceTaxid);
    } else {
        container.innerHTML = '<p class="no-data">Not enough interactions to build a network.</p>';
    }
}

function renderHubGenesTable(nodes, container, taxid) {
    if (!nodes || nodes.length === 0) return;

    // Sort by Degree desc, then Score Sum desc
    const sorted = [...nodes].sort((a, b) => {
        if (b.degree !== a.degree) return b.degree - a.degree;
        return b.scoreSum - a.scoreSum;
    });

    // Show all nodes (user requested to see all hubs)
    const top = sorted;

    const html = `
    <div class="mt-4">
        <h3 class="panel-title" style="font-size: 1rem; margin-bottom: 0.5rem;">Network Statistics</h3>
        <div class="table-responsive">
            <table class="result-table">
                <thead>
                    <tr>
                        <th>Gene</th>
                        <th>Type</th>
                        <th>Degree</th>
                        <th>Total Score</th>
                        <th>Annotation</th>
                    </tr>
                </thead>
                <tbody>
                    ${top.map(n => {
        const name = getPreferredName(n.id, taxid);
        const isQuery = n.isQuery;
        const rowClass = isQuery ? 'style="background: rgba(255, 153, 153, 0.1)"' : '';
        const typeLabel = isQuery ? '<span class="tag" style="background:#ffe3e3;color:#c92a2a">Query</span>' :
            (n.isHub ? '<span class="tag" style="background:#e7f5ff;color:#1864ab">Hub</span>' :
                '<span class="tag" style="background:var(--bg-input);color:var(--text-muted)">Interactor</span>');

        // Get annotation from cache
        const info = state.cache[taxid]?.info?.[n.id];
        const desc = info ? (info.description || info.annotation || '') : '';

        return `
                        <tr ${rowClass}>
                            <td>
                                <div><strong>${esc(name)}</strong></div>
                                <div style="font-size:0.75rem;color:var(--text-muted)">${esc(n.id)}</div>
                            </td>
                            <td>${typeLabel}</td>
                            <td><strong>${n.degree}</strong></td>
                            <td>${Math.round(n.scoreSum)}</td>
                            <td class="alias-text" title="${esc(desc)}">${esc(truncate(desc, 80))}</td>
                        </tr>`;
    }).join('')}
                </tbody>
            </table>
        </div>
    </div>`;

    const div = document.createElement('div');
    div.innerHTML = html;
    container.appendChild(div);
    div.querySelectorAll('table').forEach(makeTableSortable);
}

// ===== GO Results =====
function buildGOResults(resolvedGenes, sourceTaxid) {
    const container = $('#tab-go');
    const data = state.cache[sourceTaxid];
    if (!data || !data.go) {
        container.innerHTML = '<p class="no-data">No GO data available for this species.</p>';
        return;
    }

    const found = resolvedGenes.filter(g => g.proteinId);
    let html = '';

    for (const { query, proteinId } of found) {
        const goTerms = data.go[proteinId];
        if (!goTerms || goTerms.length === 0) continue;

        html += `<div class="result-section">`;
        html += `<div class="result-section-title"><span class="result-gene-badge">${esc(query)}</span></div>`;

        const grouped = {};
        for (const t of goTerms) {
            const cat = t.category || 'Unknown';
            if (!grouped[cat]) grouped[cat] = [];
            grouped[cat].push(t);
        }

        html += `<div class="table-responsive"><table class="result-table"><thead><tr>
      <th>Category</th><th>Term ID</th><th>Description</th>
    </tr></thead><tbody>`;

        for (const [cat, terms] of Object.entries(grouped)) {
            for (const t of terms.slice(0, 15)) {
                const tagClass = cat.includes('Process') ? 'tag-bp' : cat.includes('Function') ? 'tag-mf' : cat.includes('Component') ? 'tag-cc' : '';
                html += `<tr>
          <td><span class="tag ${tagClass}">${esc(cat)}</span></td>
          <td><code>${esc(t.term)}</code></td>
          <td>${esc(t.description)}</td>
        </tr>`;
            }
        }

        html += `</tbody></table></div></div>`;
    }

    html += notFoundSummary(resolvedGenes);
    container.innerHTML = html || '<p class="no-data">No GO results.</p>';
    container.querySelectorAll('table').forEach(makeTableSortable);
}

// ===== KEGG Results =====
function buildKEGGResults(resolvedGenes, sourceTaxid) {
    const container = $('#tab-kegg');
    const data = state.cache[sourceTaxid];
    const found = resolvedGenes.filter(g => g.proteinId);
    let html = '';

    for (const { query, proteinId } of found) {
        const keggTerms = data.kegg?.[proteinId] || []; // From kegg_enrichment.json (if acts as annotation)
        const keggPathData = data.keggPathways;
        const prefName = getPreferredName(proteinId, sourceTaxid);

        let pathwayMatches = [];
        if (keggPathData && keggPathData.gene_pathways) {
            const gp = keggPathData.gene_pathways;
            let keggGeneId = null;

            // 1. Try direct ID
            if (gp[proteinId]) keggGeneId = proteinId;
            // 2. Try Preferred Name
            else if (gp[prefName]) keggGeneId = prefName;
            // 3. Try Aliases
            else if (data.aliases && data.aliases[proteinId]) {
                for (const alias of data.aliases[proteinId]) {
                    if (gp[alias]) { keggGeneId = alias; break; }
                    const up = alias.toUpperCase();
                    if (gp[up]) { keggGeneId = up; break; }
                }
            }

            if (keggGeneId) {
                for (const pw of gp[keggGeneId]) {
                    const lookup = pw.replace(/^path:/, '');
                    const pwName = keggPathData.pathways?.[lookup] || pw;
                    pathwayMatches.push({ pathway: pw, name: pwName });
                }
            }
        }

        const otherTerms = data.otherTerms?.[proteinId] || [];
        const keggLikeTerms = otherTerms.filter(t =>
            t.category.toLowerCase().includes('kegg') ||
            t.term.startsWith('map') || t.term.startsWith('ko'));

        if (keggTerms.length === 0 && pathwayMatches.length === 0 && keggLikeTerms.length === 0) continue;

        html += `<div class="result-section">`;
        html += `<div class="result-section-title"><span class="result-gene-badge">${esc(query)}</span>`;
        if (prefName !== query) html += ` → ${esc(prefName)}`;
        html += `</div>`;

        html += `<div class="table-responsive"><table class="result-table"><thead><tr>
      <th>Source</th><th>Pathway/Term</th><th>Description</th>
    </tr></thead><tbody>`;

        // KEGG Pathways
        for (const pw of pathwayMatches) {
            html += `<tr>
        <td><span class="tag tag-kegg">KEGG Pathway</span></td>
        <td><code>${esc(pw.pathway)}</code></td>
        <td>${esc(pw.name)}</td>
      </tr>`;
        }

        // KEGG Terms (from enrichment file if any)
        for (const t of keggTerms.slice(0, 20)) {
            html += `<tr>
        <td><span class="tag tag-kegg">${esc(t.category || 'KEGG')}</span></td>
        <td><code>${esc(t.term)}</code></td>
        <td>${esc(t.description)}</td>
      </tr>`;
        }

        // Other Terms
        for (const t of keggLikeTerms.slice(0, 10)) {
            html += `<tr>
        <td><span class="tag tag-kegg">${esc(t.category)}</span></td>
        <td><code>${esc(t.term)}</code></td>
        <td>${esc(t.description)}</td>
      </tr>`;
        }

        html += `</tbody></table></div></div>`;
    }

    // Handle "Not Found" properly
    if (resolvedGenes.length > 0 && html === '') {
        // Check if we found ANY aliases/PPI but just no KEGG
        html = notFoundSummary(resolvedGenes) || '<p class="no-data">No KEGG annotations found for these genes.</p>';
    } else {
        html += notFoundSummary(resolvedGenes);
    }

    container.innerHTML = html;
    container.querySelectorAll('table').forEach(makeTableSortable);
}

// ===== Enrichment Tab Builder =====
function buildEnrichmentTab(type, result, sourceTaxid) {
    const container = $(`#tab-${type}-enrichment`);
    const label = type === 'go' ? 'GO' : 'KEGG';

    // Stats
    const sig = result.results.filter(r => r.fdr < 0.05).length;
    const statsHtml = `${result.stats.mapped} / ${result.stats.total} genes mapped · ${result.stats.termsTotal} terms tested · <strong>${sig} significant</strong> (FDR &lt; 0.05)`;

    if (result.results.length === 0) {
        container.innerHTML = `<div id="${type}-enrichment-stats" class="enrichment-stats">${statsHtml}</div><p class="no-data">No enriched ${label} terms found.</p>`;
        return;
    }

    const currentPlotType = state.enrichmentPlotType;

    let html = `
        <div id="${type}-enrichment-stats" class="enrichment-stats">${statsHtml}</div>
        <div class="enrichment-controls">
            <div class="control-group">
                <label>Plot:</label>
                <div class="btn-group">
                    <button class="btn btn-sm plot-toggle ${currentPlotType === 'bar' ? 'active' : ''}" data-plot="bar" onclick="switchEnrichmentPlot('${type}', 'bar')">Bar</button>
                    <button class="btn btn-sm plot-toggle ${currentPlotType === 'dot' ? 'active' : ''}" data-plot="dot" onclick="switchEnrichmentPlot('${type}', 'dot')">Dot</button>
                </div>
            </div>
            <div class="control-group">
                <label>Top:</label>
                <select id="enrich-top-n-${type}" class="form-control form-control-sm" style="width: 60px;" onchange="updateEnrichmentPlotAndTable('${type}')">
                    <option value="10">10</option>
                    <option value="20" selected>20</option>
                    <option value="30">30</option>
                    <option value="50">50</option>
                    <option value="100">100</option>
                </select>
            </div>
            <div class="control-group">
                <label>Palette:</label>
                <select id="enrich-palette-${type}" class="form-control form-control-sm" style="width: 100px;" onchange="updateEnrichmentPlotAndTable('${type}')">
                    <option value="Default">Default</option>
                    <option value="Viridis">Viridis</option>
                    <option value="Magma">Magma</option>
                    <option value="Plasma">Plasma</option>
                    <option value="Blues">Blues</option>
                    <option value="Reds">Reds</option>
                    <option value="Greys">Greys</option>
                </select>
            </div>
            <div class="control-group">
                <label>Export:</label>
                <div class="btn-group">
                    <button class="btn btn-sm" onclick="exportEnrichment('${type}', 'csv')">CSV</button>
                    <button class="btn btn-sm" onclick="exportEnrichment('${type}', 'png')">PNG</button>
                    <button class="btn btn-sm" onclick="exportEnrichment('${type}', 'svg')">SVG</button>
                    <button class="btn btn-sm" onclick="exportEnrichment('${type}', 'pdf')">PDF</button>
                </div>
            </div>
        </div>
        <div id="enrichment-plot-${type}" class="enrichment-plot-container"></div>
        <div class="table-responsive mt-4">
            <table class="result-table">
                <thead>
                    <tr>
                        <th>Term</th>
                        <th>Description</th>
                        <th>Category</th>
                        <th>P-Value</th>
                        <th>FDR</th>
                        <th>Fold</th>
                        <th>Genes</th>
                        <th>Bg</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td colspan="8" class="text-muted">Loading...</td>
                    </tr>
                </tbody>
            </table>
        </div>`;

    container.innerHTML = html;
    container.querySelectorAll('table').forEach(makeTableSortable);
    updateEnrichmentPlotAndTable(type); // Initial render of the plot
}

function renderEnrichmentRows(type, sourceTaxid, topN) {
    const result = type === 'go' ? state.goEnrichmentResults : state.keggEnrichmentResults;
    const table = document.querySelector(`#tab-${type}-enrichment table.result-table`);
    if (!result || !table) return;

    const tbody = table.querySelector('tbody');
    if (!tbody) return;

    const rows = result.results.slice(0, topN).map(r => `
        <tr>
            <td><div class="term-cell" title="${esc(r.term)}">${esc(r.term)}</div></td>
            <td>${esc(r.description || '')}</td>
            <td>${esc(r.category || '')}</td>
            <td>${r.pValue < 0.001 ? r.pValue.toExponential(2) : r.pValue.toFixed(4)}</td>
            <td class="${r.fdr < 0.05 ? 'text-success font-weight-bold' : ''}">${r.fdr < 0.001 ? r.fdr.toExponential(2) : r.fdr.toFixed(4)}</td>
            <td>${r.fold.toFixed(2)}</td>
            <td class="alias-text" title="${esc((r.genes || []).map(g => getPreferredName(g, sourceTaxid)).join(', '))}">
                ${r.geneCount}
            </td>
            <td>${r.bgCount}</td>
        </tr>`).join('');

    tbody.innerHTML = rows || '<tr><td colspan="8" class="text-muted">No enrichment rows available.</td></tr>';
}

function switchEnrichmentPlot(type, plotType) {
    state.enrichmentPlotType = plotType;
    // Update active class for buttons
    document.querySelectorAll(`#tab-${type}-enrichment .plot-toggle`).forEach(btn => {
        if (btn.dataset.plot === plotType) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    updateEnrichmentPlotAndTable(type);
}

function updateEnrichmentPlotAndTable(type, forcedPlotType) {
    const result = type === 'go' ? state.goEnrichmentResults : state.keggEnrichmentResults;
    if (!result) return;

    const container = document.getElementById(`enrichment-plot-${type}`);
    if (!container) return;
    container.innerHTML = '';

    const topNSelect = document.getElementById(`enrich-top-n-${type}`);
    const parsedTopN = topNSelect ? parseInt(topNSelect.value, 10) : 20;
    const topN = Number.isFinite(parsedTopN) && parsedTopN > 0 ? parsedTopN : 20;

    const paletteSelect = document.getElementById(`enrich-palette-${type}`);
    const palette = paletteSelect ? paletteSelect.value : 'Default';

    const plotType = forcedPlotType || state.enrichmentPlotType;
    state.enrichmentPlotType = plotType;

    document.querySelectorAll(`#tab-${type}-enrichment .plot-toggle`).forEach(btn => {
        btn.classList.toggle('active', btn.dataset.plot === plotType);
    });

    let svg;
    const title = type === 'go' ? 'GO Enrichment' : 'KEGG Pathway Enrichment';

    if (plotType === 'bar') {
        svg = window.Plots.createBarChart(result.results, topN, palette, title);
    } else {
        svg = window.Plots.createDotPlot(result.results, topN, palette, title);
    }

    if (svg) {
        container.appendChild(svg);
    } else {
        container.innerHTML = '<div class="text-muted p-3">No significant terms found (or empty results).</div>';
    }

    renderEnrichmentRows(type, state.sourceSpecies, topN);
}

function exportEnrichment(type, format) {
    const result = type === 'go' ? state.goEnrichmentResults : state.keggEnrichmentResults;
    if (!result) return alert('No enrichment results to export. Run an analysis first.');

    const getNameFn = (pid) => getPreferredName(pid, state.sourceSpecies);
    const name = `${type}_enrichment`;

    if (format === 'csv') {
        window.Export.downloadCSV(result.results, `${name}.csv`, getNameFn);
    } else {
        const svg = $(`#enrichment-plot-${type} svg`);
        if (!svg) return alert('No plot to export. Render the plot first.');

        if (format === 'png') window.Export.downloadPNG(svg, `${name}.png`);
        else if (format === 'svg') window.Export.downloadSVG(svg, `${name}.svg`);
        else if (format === 'pdf') window.Export.downloadPDF(svg, `${name}.pdf`);
    }
}

// ===== UI Helpers =====
function showLoading(text) {
    els.loadingText.textContent = text;
    els.loadingOverlay.hidden = false;
}
function hideLoading() { els.loadingOverlay.hidden = true; }

function switchTab(tabName) {
    $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
    $$('.tab-content').forEach(tc => tc.classList.toggle('active', tc.id === `tab-${tabName}`));
}

function switchModalTab(targetId) {
    $$('.modal-tab').forEach(t => t.classList.toggle('active', t.dataset.target === targetId));
    $$('.modal-tab-content').forEach(c => c.classList.toggle('active', c.id === targetId));
}

// ===== Database Version Modal =====
function renderDBVersions() {
    if (!state.metadata) return;
    const dbs = state.metadata.databases;
    let html = '';
    for (const [key, db] of Object.entries(dbs)) {
        html += `<div class="db-card">
      <div class="db-card-header">
        <span class="db-card-name">${esc(db.name)}</span>
        <span class="db-card-version">${esc(db.version)}</span>
      </div>
      <div class="db-card-desc">${esc(db.description)}</div>
      <div class="db-card-date">Release: ${esc(db.release_date)} · Downloaded: ${esc(state.metadata.download_date)}</div>
      <a class="db-card-url" href="${esc(db.url)}" target="_blank">${esc(db.url)}</a>
    </div>`;
    }
    // Phylogeny database card
    if (state.phylogenyData && state.phylogenyData.metadata) {
        const pm = state.phylogenyData.metadata;
        html += `<div class="db-card">
      <div class="db-card-header">
        <span class="db-card-name">${esc(pm.source || 'Phylogeny')}</span>
        <span class="db-card-version">${esc(pm.string_version || pm.version || '')}</span>
      </div>
      <div class="db-card-desc">${esc(pm.description || '')}</div>
      <div class="db-card-date">Species: ${pm.species_count || ''} · Orthogroups: ${pm.orthogroup_count || ''} · Trees: ${pm.tree_count || ''}</div>
      <a class="db-card-url" href="https://string-db.org" target="_blank">${esc(pm.url || 'https://string-db.org')}</a>
    </div>`;
    }
    els.dbVersionList.innerHTML = html;
}

// ===== Theme =====
function initTheme() {
    const saved = localStorage.getItem('gr-theme');
    if (saved) document.documentElement.setAttribute('data-theme', saved);

    els.themeToggle.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('gr-theme', next);
        // Re-render plots if they exist
        if (state.goEnrichmentResults && state.goEnrichmentResults.results.length > 0) {
            const activeGoPlot = document.querySelector('#tab-go-enrichment .plot-toggle.active');
            updateEnrichmentPlotAndTable('go', activeGoPlot?.dataset.plot || 'bar');
        }
        if (state.keggEnrichmentResults && state.keggEnrichmentResults.results.length > 0) {
            const activeKeggPlot = document.querySelector('#tab-kegg-enrichment .plot-toggle.active');
            updateEnrichmentPlotAndTable('kegg', activeKeggPlot?.dataset.plot || 'bar');
        }
        // Re-render network if exists
        const btn = $('#net-svg-btn');
        if (btn && !els.resultsContent.hidden) {
            buildPPINetwork(state.genes.map(g => ({ query: g, proteinId: resolveGene(g, state.sourceSpecies) })), state.sourceSpecies);
        }
        // Re-render phylogeny trees if exists
        if (state.phylogenyData && !els.resultsContent.hidden) {
            const resolvedGenes = state.genes.map(g => ({ query: g, proteinId: resolveGene(g, state.sourceSpecies) }));
            window.Phylogeny.buildPhylogenyTab(resolvedGenes, state.sourceSpecies, state.targetSpecies, state.phylogenyData);
        }
    });
}

// ===== Initialization =====
async function init() {
    initTheme();

    const [speciesList, metadata] = await Promise.all([
        fetchJSON('data/species.json'),
        fetchJSON('data/metadata.json'),
    ]);

    if (!speciesList) {
        els.sourceSelect.innerHTML = '<option value="">Error loading species</option>';
        return;
    }

    state.speciesList = speciesList;
    state.metadata = metadata;

    els.sourceSelect.innerHTML = '<option value="">— Select a species —</option>';
    for (const sp of speciesList) {
        const opt = document.createElement('option');
        opt.value = sp.taxid;
        opt.textContent = `${sp.compact_name} (${sp.taxid})`;
        els.sourceSelect.appendChild(opt);
    }

    let checkboxHtml = '';
    for (const sp of speciesList) {
        checkboxHtml += `<label class="checkbox-item">
      <input type="checkbox" value="${sp.taxid}">
      ${esc(sp.compact_name)}
    </label>`;
    }
    els.targetList.innerHTML = checkboxHtml;

    renderDBVersions();

    // ===== Event Listeners =====

    // Auto-detect prompt on input
    els.geneInput.addEventListener('input', () => {
        updateAutoDetectHint();
    });

    els.scoreSlider.addEventListener('input', () => {
        els.scoreValue.value = els.scoreSlider.value;
    });

    els.scoreValue.addEventListener('input', () => {
        const val = parseInt(els.scoreValue.value);
        if (val >= 400 && val <= 999) {
            els.scoreSlider.value = val;
        }
    });

    els.scoreValue.addEventListener('change', () => {
        let val = parseInt(els.scoreValue.value);
        if (val < 400) val = 400;
        if (val > 999) val = 999;
        if (isNaN(val)) val = 700;
        els.scoreValue.value = val;
        els.scoreSlider.value = val;
    });

    els.analyzeBtn.addEventListener('click', () => runAnalysis());

    $$('.tab').forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));

    $('#select-all-targets').addEventListener('click', () => {
        $$('#target-species-list input').forEach(cb => cb.checked = true);
    });
    $('#deselect-all-targets').addEventListener('click', () => {
        $$('#target-species-list input').forEach(cb => cb.checked = false);
    });

    // Modal
    els.aboutBtn.addEventListener('click', () => els.dbModal.hidden = false);
    els.dbModal.querySelector('.modal-backdrop').addEventListener('click', () => els.dbModal.hidden = true);
    els.dbModal.querySelector('.modal-close').addEventListener('click', () => els.dbModal.hidden = true);

    // Modal Tabs
    $$('.modal-tab').forEach(t => t.addEventListener('click', () => switchModalTab(t.dataset.target)));

    // Network Export
    const exportNet = (format) => {
        const svg = $(`#ppi-network-plot svg`);
        if (!svg) return alert('No network to export.');
        const name = `ppi_network`;
        if (format === 'png') window.Export.downloadPNG(svg, `${name}.png`, 2);
        else if (format === 'svg') window.Export.downloadSVG(svg, `${name}.svg`);
        else if (format === 'pdf') window.Export.downloadPDF(svg, `${name}.pdf`, 2);
    };
    $('#net-png-btn').addEventListener('click', () => exportNet('png'));
    $('#net-svg-btn').addEventListener('click', () => exportNet('svg'));
    $('#net-pdf-btn').addEventListener('click', () => exportNet('pdf'));
}

// ===== Table Sorting =====
function makeTableSortable(table) {
    const headers = table.querySelectorAll('th');
    const tbody = table.querySelector('tbody');
    if (!tbody) return;

    headers.forEach((th, index) => {
        th.classList.add('sortable');
        th.addEventListener('click', () => {
            const currentDir = th.classList.contains('asc') ? 'asc' : (th.classList.contains('desc') ? 'desc' : 'neutral');
            const newDir = currentDir === 'neutral' ? 'asc' : (currentDir === 'asc' ? 'desc' : 'neutral');

            // Reset others
            headers.forEach(h => h.classList.remove('asc', 'desc'));

            if (newDir === 'neutral') {
                const rows = Array.from(tbody.querySelectorAll('tr'));
                rows.sort((a, b) => (a.dataset.originalIndex || 0) - (b.dataset.originalIndex || 0));
                rows.forEach(r => tbody.appendChild(r));
            } else {
                th.classList.add(newDir);
                const rows = Array.from(tbody.querySelectorAll('tr'));
                const type = th.innerText.toLowerCase().match(/score|degree|value|fdr|fold|bg|genes/) ? 'number' : 'string';

                rows.sort((a, b) => {
                    const aCell = a.children[index];
                    const bCell = b.children[index];
                    const aVal = aCell ? aCell.innerText.trim() : '';
                    const bVal = bCell ? bCell.innerText.trim() : '';

                    if (type === 'number') {
                        const aNum = parseFloat(aVal.replace(/[^0-9.\-eE]/g, '')) || 0;
                        const bNum = parseFloat(bVal.replace(/[^0-9.\-eE]/g, '')) || 0;
                        return newDir === 'asc' ? aNum - bNum : bNum - aNum;
                    } else {
                        return newDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
                    }
                });

                rows.forEach(r => tbody.appendChild(r));
            }
        });
    });

    // Store original index
    Array.from(tbody.querySelectorAll('tr')).forEach((tr, i) => tr.dataset.originalIndex = i);
}

document.addEventListener('DOMContentLoaded', init);
