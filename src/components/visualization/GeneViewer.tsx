import React from "react";
import { createComponent } from "@lit/react";
import { GeneViewer } from "gene-viewer";

export const GeneViewerComponent = createComponent({
    tagName: "gene-viewer",
    elementClass: GeneViewer,
    react: React,
    events: {
        onGeneChanged: "geneChanged",
        onProbesetsChanged: "probesetsChanged",
        onProbesSelected: "probesSelected",
        onProbesetSelected: "probesetSelected",
        onGeneViewerReady: "geneViewerReady",
    },
});
