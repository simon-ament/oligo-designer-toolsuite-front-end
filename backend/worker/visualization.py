import os
from collections import defaultdict
from pathlib import Path
from typing import Any

import yaml
from gene_viewer import GeneViewer
from glom import glom

from backend.config import Config


def _create_visualization(self, run_id: str, form_data: dict, output_path: str) -> None:
    """Generate visualization files for the given run.

    Arguments:
        run_id {str} -- The unique ID of the run.
        form_data {dict} -- The pipeline configuration.
        output_path {str} -- The path where all output of the pipeline should be written.
    """

    backend_root = Path(__file__).resolve().parent.parent
    data_access_root = backend_root / os.environ.get(
        "FLASK_RELATIVE_DATA_ACCESS_PATH",
        Config.RELATIVE_DATA_ACCESS_PATH,
    )
    visualization_root = data_access_root / os.environ.get(
        "FLASK_RELATIVE_VISUALIZATION_PATH",
        Config.RELATIVE_VISUALIZATION_PATH,
    )

    # find files_fasta_target_probe_database fasta file and read it
    fasta_paths = glom(form_data, "target_probe.oligo_generation.files_fasta_probe_database")
    if not fasta_paths:
        self.logger.debug("No fasta files provided, skipping visualization generation.")
        return

    # find output file name containing "probes" or "probeset"
    output_yaml = next(
        (
            fname
            for fname in os.listdir(output_path)
            if ("probes" in fname or "probeset" in fname)
            and "order" not in fname
            and (fname.endswith(".yml") or fname.endswith(".yaml"))
        ),
        None,
    )
    if not output_yaml:
        self.logger.debug(
            "No output YAML file containing 'probes' or 'probeset' found, skipping visualization generation."
        )
        return
    probes_path = os.path.join(output_path, output_yaml)

    gene_viewer = GeneViewer(run_id, str(visualization_root))
    for fasta_path in fasta_paths:
        gene_viewer.load_regions_ODTFasta(fasta_path, region_types=[])
        gene_viewer.load_sequences_ODTFasta(fasta_path, region_types=[])

    probes = _load_probes(probes_path)
    for gene, oligosets in probes.items():
        for oligoset_name, oligoset_probes in oligosets.items():
            for probe in oligoset_probes:
                gene_viewer.add_probe(gene, oligoset_name, probe)

    gene_viewer.save()


def _load_probes(probes_path: str):
    """Loads probes and scores from probes yaml file, matches probes to regions, and fills gaps for exon-exon junction probes.

    Returns:
        tuple[dict[str, dict[str, list[dict]]], dict[str, dict]]: Two dictionaries, one containing probes grouped by gene and oligoset, and another containing scores for each oligoset.
    """
    probes: defaultdict[Any, dict] = defaultdict(lambda: defaultdict(list))

    if not os.path.exists(probes_path):
        return probes

    with open(probes_path) as f:
        probe_data = yaml.safe_load(f)
        for gene, oligosets in probe_data.items():
            for oligoset_name, oligoset_entries in oligosets.items():
                oligoset_name = oligoset_name.replace("Oligos", "S")
                # only keep entries whose key begins with "Oligo "
                oligo_probes = filter(lambda x: x[0].startswith("Oligo "), oligoset_entries.items())
                for _, probe_info in oligo_probes:
                    # add probe info to probes dict
                    probes_list = _generate_probes_from_probe_info(probe_info)
                    for probe in probes_list:
                        probes[gene][oligoset_name].append(probe)

    # convert defaultdict to dict for clean output
    for gene in probes:
        probes[gene] = dict(probes[gene])
    return dict(probes)


LIST_FIELDS = ("transcript_id", "exon_number", "start", "end")


def _generate_probes_from_probe_info(probe_info):
    """Generates probe entries from probe info, handling multiple locations for the same probe sequence and filling gaps for exon-exon junction probes.

    Args:
        probe_info (dict): Dictionary containing probe information.

    Returns:
        list[dict]: List of generated probe entries.
    """
    # cast entries to lists of lists if they are not already
    for field in probe_info:
        if not isinstance(probe_info[field], list):
            probe_info[field] = [probe_info[field]]
        entries_list = []
        for entry in probe_info[field]:
            if isinstance(entry, list):
                entries_list.append(entry)
            else:
                entries_list.append([entry])
        probe_info[field] = entries_list

    # explode all fields of probe_info into separate probe entries (assume all fields have the same length, fall back to first entry if field has different length)
    # in most cases, there will only be one entry
    # in rare cases, the same probe sequence can be located at multiple positions
    # -> then some fields (e.g. start, end) will have multiple entries, while others (e.g. sequence_...) will only have one entry that applies to all locations
    probe_entries = []
    probes_count = len(probe_info["start"])
    for i in range(probes_count):
        probe_entry: dict
        index = i if len(probe_info[field]) == probes_count else 0
        probe_entries.append(
            {
                field: (lst if field in LIST_FIELDS else lst[0])
                for field in probe_info
                if (lst := probe_info[field][index])
            }
        )

    probes = []
    for probe_index, probe_entry in enumerate(probe_entries):
        regiontype = probe_entry.get("regiontype", "unknown")
        starts = probe_entry["start"]
        ends = probe_entry["end"]
        transcript_ids = probe_entry.get("transcript_id", [])

        components = []
        if regiontype != "exonexonjunction":
            # single continous probe, add as single component
            components.append({"start": starts[0], "end": ends[0]})
        else:
            # for exon-exon junction probes, add gaps between exons as components
            components.append({"start": starts[0], "end": ends[0]})
            components.append({"start": starts[1], "end": ends[1]})

        probes.append(
            {
                "id": probe_entry["oligo_id"] + (f"({probe_index + 1})" if probes_count > 1 else ""),
                "locations": components,
                "transcript_ids": transcript_ids,
                "start": starts[0],
                "end": ends[-1],
                "metadata": probe_entry,
            }
        )
    return probes
