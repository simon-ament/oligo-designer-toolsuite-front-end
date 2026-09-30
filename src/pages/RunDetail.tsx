import { useCallback, useMemo, useRef, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router";
import axios from "axios";
import ComponentDefinition from "../components/visualization/oligoComponents.json";
import { BACKEND_URL } from "../config";
import { Alert, Table } from "react-bootstrap";
import Page from "../components/ui/Page";
import { useRuns } from "../hooks/useRuns";
import Divider from "../components/ui/Divider";
import { Vertical } from "../components/ui/Alignment";
import {
    BoxArrowUp,
    Download,
    FileEarmark,
    FileEarmarkSpreadsheet,
    GearFill,
    Trash,
} from "react-bootstrap-icons";
import { showToast } from "../utils/toastUtil";
import RunStatus from "../components/ui/RunStatus";
import { confirmWithModal } from "../utils/modalUtil";
import type { Action, FileDownloadAction } from "../components/ui/Header";
import RunStatusDetails from "../components/ui/RunStatusDetails";
import RunError from "../components/ui/RunError";
import {
    useNavigateWithRunConfig,
    downloadConfig,
} from "../utils/runConfigHelper";
import RunMetrics from "../components/RunMetrics";
import RunDetailFileAction from "./RunDetailFileAction";
import { PIPELINE_CONFIG, type PipelineConfig } from "../pipelineConfig/config";
import { GeneViewerComponent } from "../components/visualization/GeneViewer";
import type { GeneViewer, Probes } from "gene-viewer";
import type {
    GeneChangedEvent,
    ProbesetsChangedEvent,
    ProbesSelectedEvent,
} from "gene-viewer";

interface LocationState {
    fromAdmin?: boolean;
}
/**
 *
 * @returns A React functional component that renders the details of a specific run, including its status, results, and available actions.
 */
const RunDetail = () => {
    const { runId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { runs, updateRuns } = useRuns();

    const [selectedGene, setSelectedGene] = useState<{
        source: string | null;
        species: string | null;
        seq_id: string;
    } | null>(null);
    const [selectedOligosets, setSelectedOligosets] = useState<string[]>([]);
    const [selectedOligos, setSelectedOligos] = useState<string[]>([]);
    const [probes, setProbes] = useState<Probes | undefined>(undefined); // undefined = not loaded yet, null = no probes available or error loading
    const geneViewerRef = useRef<GeneViewer | null>(null);

    const run = useMemo(() => runs.find((r) => r._id === runId), [runs, runId]);

    const tableColumns = ComponentDefinition[
        run?.pipeline as keyof typeof ComponentDefinition
    ]?.columns as string[];

    const handleDelete = useCallback(async () => {
        if (!run) return;

        confirmWithModal({
            title: "Confirm Deletion",
            content:
                "Are you sure you want to delete this run? This action cannot be undone.",
            primaryAction: {
                label: "Delete",
                variant: "danger",
                callback: async () => {
                    try {
                        await axios.delete(
                            BACKEND_URL + `/api/runs/${run._id}`,
                            {
                                withCredentials: true,
                            }
                        );
                        updateRuns();
                        // Navigate back to admin panel if we came from there, otherwise go to runs page
                        const fromAdmin = (location.state as LocationState)
                            ?.fromAdmin;
                        navigate(fromAdmin ? "/admin/pipelines" : "/runs");
                    } catch (error) {
                        console.error("Error deleting run:", error);
                        showToast({
                            title: "Failed to delete run",
                            content:
                                "An error occurred while trying to delete the run. Please try again later.",
                            type: "danger",
                        });
                    }
                },
            },
        });
    }, [run, navigate, location.state, updateRuns]);

    const handleUseSettings = useNavigateWithRunConfig(run, navigate);

    const handleExport = useCallback(async () => {
        await downloadConfig(run);
    }, [run]);

    const fromAdmin = (location.state as LocationState)?.fromAdmin;

    const fileActions = useMemo(() => {
        if (!run) return;

        const baseFileUrl = BACKEND_URL + `/api/runs/${run._id}/files/`;

        const fileDownloads =
            PIPELINE_CONFIG[run.pipeline as keyof PipelineConfig].fileDownloads;

        if (!fileDownloads) return;

        return {
            type: "fileDownload",
            label: "Download Files",
            icon: Download,
            fileDownloads: [
                {
                    label: "Oligo Table Excel",
                    icon: FileEarmarkSpreadsheet,
                    fileName: fileDownloads.excelFile,
                    url: baseFileUrl + fileDownloads.excelFile,
                },
                {
                    label: "Oligo Table Tsv",
                    icon: FileEarmarkSpreadsheet,
                    fileName: fileDownloads.probesTable,
                    url: baseFileUrl + fileDownloads.probesTable,
                },
                {
                    label: "Oligo Probes Order",
                    icon: FileEarmark,
                    fileName: fileDownloads.probesOrder,
                    url: baseFileUrl + fileDownloads.probesOrder,
                },
                {
                    label: "Oligo Probes",
                    icon: FileEarmark,
                    fileName: fileDownloads.probes,
                    url: baseFileUrl + fileDownloads.probes,
                },
            ],
        } as FileDownloadAction;
    }, [run]);

    const actions = useMemo(() => {
        if (!run) return undefined;

        const deleteAction = {
            type: "button",
            label: "Delete Run",
            variant: "outline-danger",
            icon: Trash,
            onClick: handleDelete,
        };

        const useSettingsAction = {
            type: "button",
            label: "Use Settings",
            variant: "outline-border",
            icon: GearFill,
            onClick: handleUseSettings,
        };

        const exportSettingsAction = {
            type: "button",
            label: "Export Settings",
            icon: BoxArrowUp,
            variant: "outline-border",
            onClick: handleExport,
        };

        const basicActions = [
            useSettingsAction,
            exportSettingsAction,
            deleteAction,
        ];

        if (probes) {
            if (!fileActions) return basicActions;

            return [
                useSettingsAction,
                exportSettingsAction,
                fileActions,
                deleteAction,
            ];
        } else {
            return basicActions;
        }
    }, [
        run,
        probes,
        handleDelete,
        handleUseSettings,
        fileActions,
        handleExport,
    ]);

    return (
        <Page
            title={`Run Result - ${run ? run.run_name : "Unknown Pipeline Run"}`}
            actions={actions as Action[] | undefined}
            backTo={{
                label: fromAdmin ? "Admin Panel" : "All Runs",
                href: fromAdmin ? "/admin/pipelines" : "/runs",
            }}
        >
            {!run && (
                <Alert variant="danger">
                    Run not found. It may have been deleted.
                </Alert>
            )}

            {/* Polling/waiting for YAML/log */}
            {(run?.status == "pending" || run?.status == "started") && (
                <Vertical align="center" className="my-5" gap="lg">
                    <RunStatus status={run.status} size={100} />
                    <RunStatusDetails run={run} />
                </Vertical>
            )}

            {run &&
                ["failure", "empty_result", "timeout"].includes(run.status) && (
                    <RunError run={run} />
                )}

            {/* YAML/table logic remains unchanged below */}
            {run?.status === "success" && (
                <>
                    {probes === undefined && (
                        <Vertical align="center" className="my-5" gap="lg">
                            <RunStatus status="pending" size={100} />
                            <h3 className="mt-3">Loading results...</h3>
                        </Vertical>
                    )}

                    <Vertical
                        className="visual-container"
                        align="stretch"
                        gap="lg"
                    >
                        <GeneViewerComponent
                            viewerServer={`${BACKEND_URL}/api/runs/visualizations`}
                            viewerId={runId}
                            scaleFactor={1.1}
                            parallelProbesets={2}
                            ref={geneViewerRef}
                            onGeneChanged={(e: Event) => {
                                setSelectedGene(
                                    (e as GeneChangedEvent).detail.gene ?? null
                                );
                                setProbes(
                                    (e as GeneChangedEvent).detail.gene?.probes
                                );
                            }}
                            onProbesetsChanged={(e: Event) => {
                                setSelectedOligosets(
                                    (e as ProbesetsChangedEvent).detail
                                        .newProbesetIds
                                );
                            }}
                            onProbesSelected={(e: Event) => {
                                setSelectedOligos(
                                    (e as ProbesSelectedEvent).detail
                                        .newProbeIds
                                );
                            }}
                        />

                        {probes && selectedOligosets && (
                            <>
                                <Table responsive bordered hover>
                                    <thead className="table-light">
                                        <tr>
                                            {tableColumns.map((column) => (
                                                <th
                                                    key={column}
                                                    className="text-nowrap"
                                                >
                                                    {column.replace(/_/g, " ")}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>

                                    <tbody>
                                        {selectedOligosets.map((oligoset) => (
                                            <>
                                                <tr key={oligoset}>
                                                    <td
                                                        colSpan={
                                                            tableColumns.length
                                                        }
                                                        className="table-secondary"
                                                    >
                                                        <strong>
                                                            {oligoset}
                                                        </strong>
                                                    </td>
                                                </tr>
                                                {probes[oligoset]?.map(
                                                    (oligo) => (
                                                        <tr key={oligo.id}>
                                                            {tableColumns.map(
                                                                (column) => (
                                                                    <td
                                                                        key={`${oligo.id}-${column}`}
                                                                        className={
                                                                            "text-nowrap " +
                                                                            (selectedOligos.includes(
                                                                                oligo.id
                                                                            )
                                                                                ? "table-active"
                                                                                : "")
                                                                        }
                                                                        onClick={() =>
                                                                            // select/deselect oligo on click
                                                                            geneViewerRef.current?.selectProbe(
                                                                                selectedOligos.includes(
                                                                                    oligo.id
                                                                                )
                                                                                    ? null
                                                                                    : oligo.id,
                                                                                true
                                                                            )
                                                                        }
                                                                    >
                                                                        {
                                                                            column ===
                                                                                "oligo_id" &&
                                                                                oligo.id /* contains index for oligo with multiple locations */
                                                                        }
                                                                        {column ===
                                                                            "location" &&
                                                                            `${selectedGene?.seq_id}:${oligo.start}-${oligo.end}`}
                                                                        {column !==
                                                                            "oligo_id" &&
                                                                            column !==
                                                                                "location" &&
                                                                            oligo
                                                                                .metadata?.[
                                                                                column
                                                                            ]}
                                                                    </td>
                                                                )
                                                            )}
                                                        </tr>
                                                    )
                                                )}
                                            </>
                                        ))}
                                    </tbody>

                                    <tfoot>
                                        <tr>
                                            <td colSpan={tableColumns.length}>
                                                <strong>Source:</strong>{" "}
                                                {selectedGene?.source ?? "N/A"}
                                                <br />
                                                <strong>Species:</strong>{" "}
                                                {selectedGene?.species ?? "N/A"}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </Table>
                                <span className="text-muted">
                                    Click an oligo in the table to focus it in
                                    the visualization. Use the mouse wheel to
                                    zoom in for more details.
                                </span>
                            </>
                        )}
                    </Vertical>
                    <Divider />

                    <h2>File Downloads</h2>
                    {fileActions && (
                        <RunDetailFileAction
                            actions={fileActions.fileDownloads}
                        />
                    )}
                </>
            )}

            {run && <RunMetrics metrics={run.metrics} />}
        </Page>
    );
};

export default RunDetail;
