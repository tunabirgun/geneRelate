# geneRelate

**A static, client-side bioinformatics tool for cross-species gene analysis in *Fusarium*.**

geneRelate enables researchers to map orthologs, explore protein-protein interactions, and perform functional enrichment analysis across 20 *Fusarium* species — entirely in the browser with no backend server required.

**A live demo can be accessed through the link in the repository description.**



## Features

- **Cross-Species Alias Mapping** — Resolve gene names, locus tags, and protein IDs across 20 *Fusarium* species using pre-computed lookup tables
- **Protein-Protein Interaction (PPI) Tables** — Browse interactions from STRING v12.0 with configurable score thresholds (400–999)
- **Interactive PPI Network** — Force-directed network visualization with zoom, pan, and drag. Hub genes identified by degree centrality
- **GO Annotations** — Per-gene Gene Ontology terms (Biological Process, Molecular Function, Cellular Component)
- **KEGG Pathway Annotations** — Per-gene KEGG pathway mappings
- **GO Enrichment Analysis** — Over-representation analysis using Fisher's Exact Test (hypergeometric) with Benjamini-Hochberg FDR correction
- **KEGG Enrichment Analysis** — Pathway enrichment with the same statistical framework
- **Publication-Quality Plots** — Bar charts, dot plots, and hierarchical clustering dendrograms with 7 color palettes (Default, Viridis, Magma, Plasma, Blues, Reds, Greys)
- **Hierarchical Clustering Tree** — UPGMA dendrogram clustering enriched terms by gene set overlap (Jaccard distance), similar to ShinyGO's Tree view
- **Interactive Gene Tooltips** — Hover over any gene or protein ID to see functional annotation, GO terms, KEGG pathways, and direct links to UniProt, STRING, AmiGO, and KEGG
- **Phylogeny Analysis** — Per-gene phylogenetic trees from eggNOG v5.0 pre-computed gene trees, mapped via STRING orthologous groups at the Fungi level
- **Phylogenetic Export Formats** — Newick, NEXUS (PAUP\*, MrBayes, FigTree), and PhyloXML (Archaeopteryx, ETE, forester) for compatibility with external phylogenetic analysis tools
- **Multiple Export Formats** — CSV, PNG (high-resolution), SVG, and PDF
- **Dark / Light Theme** — Persistent theme preference

## Species Coverage

geneRelate includes data for 20 *Fusarium* species sourced from STRING v12.0:

| Species | Taxon ID | Notes |
|---|---|---|
| *F. graminearum* PH-1 | 229533 | |
| *F. verticillioides* 7600 | 334819 | |
| *F. oxysporum* f. sp. *lycopersici* 4287 | 426428 | |
| *F. oxysporum* Fo5176 | 660025 | |
| *F. fujikuroi* IMI 58289 | 1279085 | |
| *F. sporotrichioides* | 5514 | |
| *F. poae* | 36050 | |
| *F. nygamai* | 42673 | |
| *F. venenatum* | 56646 | |
| *F. oxysporum* f. sp. *radicis-cucumerinum* | 327505 | |
| *F. oxysporum* f. sp. *cubense* race 1 | 1229664 | |
| *F. oxysporum* f. sp. *cubense* race 4 | 1229665 | |
| *F. longipes* | 694270 | |
| *F. kuroshium* | 2010991 | |
| *F. fasciculatum* | 2594813 | |
| *F.* sp. AF-4 | 1325735 | |
| *F.* sp. AF-6 | 1325737 | |
| *F.* sp. AF-8 | 1325734 | |
| *F. culmorum* | 5516 | Synthetic (derived from *F. graminearum*) |
| *F. pseudograminearum* CS3096 | 1028729 | Synthetic (derived from *F. graminearum*) |

## Methods

### Orthology Mapping

Orthologs are mapped using pre-computed lookup tables derived from FungiDB and Ensembl Fungi. Gene resolution supports protein IDs, locus tags, preferred names, and aliases (case-insensitive).

### PPI Networks

Interaction data is sourced from STRING v12.0. The network visualization uses a synchronous force-directed layout (300 iterations) to cluster related proteins. Hub genes are identified based on degree centrality (top 20%, minimum degree 3).

### Enrichment Analysis

GO and KEGG enrichment is performed using a Fisher's Exact Test (hypergeometric test) with Benjamini-Hochberg FDR correction. Background sets are species-specific genome-wide annotations.

### Hierarchical Clustering of Enriched Terms

Enriched terms can be visualized as a hierarchical clustering dendrogram (Tree view). The clustering method:

1. **Distance metric** — Pairwise Jaccard distance between terms based on their annotated gene sets: *d(A, B) = 1 − |A ∩ B| / |A ∪ B|*. Terms sharing more genes are closer in the tree.
2. **Clustering algorithm** — UPGMA (Unweighted Pair Group Method with Arithmetic Mean), which produces ultrametric trees where the distance from the root to any leaf is equal. This is appropriate for functional term clustering where the goal is to identify groups of related biological processes, not to infer evolutionary relationships.
3. **Visualization** — Horizontal dendrogram with branch length proportional to Jaccard distance. Leaf nodes are colored by significance (−log₁₀ FDR) using the selected color palette.

### Phylogeny Analysis

Gene trees are derived from eggNOG v5.0 pre-computed phylogenies at the Fungi level (taxonomy ID 4751). Orthologous group (NOG) assignments are obtained from STRING v12.0 hierarchical orthology data. The mapping pipeline:

1. For each protein, STRING provides eggNOG NOG assignments at the Fungi level (taxid 4751)
2. Proteins sharing the same NOG ID are grouped into orthogroups
3. STRING protein IDs are mapped to locus tags, then to eggNOG internal protein IDs
4. Matching eggNOG group IDs are used to retrieve pre-computed gene trees (inferred via species tree reconciliation and maximum-likelihood methods)

The resulting dataset covers 14,952 orthogroups (257,283 genes) across 18 *Fusarium* species, with 9,524 gene trees available. Trees are rendered as rectangular cladograms with query genes highlighted in red and target species genes highlighted in blue. Export is available in PNG, SVG, PDF, Newick, NEXUS, and PhyloXML formats.

### Synthetic Species Data

*F. culmorum* and *F. pseudograminearum* are not available in STRING. Their data is derived from *F. graminearum* via gene ID prefix mapping (FGSG_ &rarr; FCUL_ / FPSE_). PPI networks, GO annotations, and KEGG pathways shown for these species reflect *F. graminearum* data and should be interpreted accordingly.

## Data Sources

| Database | Version | URL |
|---|---|---|
| STRING | v12.0 | https://string-db.org |
| KEGG | Current | https://www.kegg.jp |
| Gene Ontology | Current | https://geneontology.org |
| eggNOG | v5.0 | http://eggnog5.embl.de |
| FungiDB / VEuPathDB | Current | https://fungidb.org |

## Limitations

- **Alias-based orthology** — Cross-species mapping uses name/alias matching, not reciprocal BLAST or dedicated orthology tools. It may miss orthologs with different names or produce false matches.
- **Synthetic species** — *F. culmorum* and *F. pseudograminearum* data assumes 1:1 correspondence with *F. graminearum*, which is not guaranteed biologically.
- **KEGG coverage** — Only species with KEGG organism codes have pathway data. Some species will show zero KEGG annotations.
- **Static data** — Pre-downloaded data does not auto-update. Periodic pipeline re-runs are needed when source databases release new versions.

## Usage

1. Select a **source species** from the dropdown (or let auto-detection identify it from gene prefixes)
2. Enter **gene names** (one per line or comma-separated) — supports locus tags (e.g., `FGSG_00362`), gene names (e.g., `TRI5`), or protein IDs
3. Optionally select **target species** for cross-species alias lookup
4. Adjust the **PPI score threshold** (default: 700)
5. Click **Analyze**

## Local Development

geneRelate is a fully static site. To run locally:

```bash
# Any static file server works
cd public
python -m http.server 8000
# or
npx serve .
```

Then open `http://localhost:8000` in your browser.

## References

- Szklarczyk, D., et al. (2023). The STRING database in 2023. *Nucleic Acids Research*, *51*(D1), D483–D489. https://doi.org/10.1093/nar/gkac1000
- Kanehisa, M., et al. (2023). KEGG for taxonomy-based analysis of pathways and genomes. *Nucleic Acids Research*, *51*(D1), D587–D592. https://doi.org/10.1093/nar/gkac963
- The Gene Ontology Consortium. (2023). The Gene Ontology knowledgebase in 2023. *Genetics*, *224*(1), iyad031. https://doi.org/10.1093/genetics/iyad031
- Amos, B., et al. (2022). VEuPathDB: The eukaryotic pathogen, vector and host bioinformatics resource center. *Nucleic Acids Research*, *50*(D1), D898–D911. https://doi.org/10.1093/nar/gkab929
- Huerta-Cepas, J., et al. (2019). eggNOG 5.0: a hierarchical, functionally and phylogenetically annotated orthology resource based on 5090 organisms and 2502 viruses. *Nucleic Acids Research*, *47*(D1), D309–D314. https://doi.org/10.1093/nar/gky1085
