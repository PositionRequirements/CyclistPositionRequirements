const form = document.querySelector("#lookup-form");
const meanInput = document.querySelector("#mean");
const stdInput = document.querySelector("#std");
const button = document.querySelector("#lookup-button");
const status = document.querySelector("#status");
const lookupMeta = document.querySelector("#lookup-meta");
const plotMeta = document.querySelector("#plot-meta");
const pmaValue = document.querySelector("#pma-value");
const pfaValue = document.querySelector("#pfa-value");
const plotElement = document.querySelector("#plot");
const hoverMean = document.querySelector("#hover-mean");
const hoverStd = document.querySelector("#hover-std");
const hoverMetricLabel = document.querySelector("#hover-metric-label");
const hoverValue = document.querySelector("#hover-value");
const metricButtons = [...document.querySelectorAll(".metric-button")];

const MIN_VALUE = 0.01;
const MAX_VALUE = 1;
const METRICS = ["PMA", "PFA"];

let activeMetric = "PMA";
let activeSelection = null;
let surfaceData = null;
let plotEventsBound = false;

const formatKey = (value) => (Math.round(value * 100) / 100).toFixed(2);
const formatResult = (value) =>
  Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4
  });

const setBusy = (isBusy) => {
  button.disabled = isBusy;
  button.textContent = isBusy ? "Calculating…" : "Calculate Errors";
};

const setStatus = (message, isError = false) => {
  status.textContent = message;
  status.style.color = isError ? "#b42318" : "";
};

const resetResults = () => {
  pmaValue.textContent = "--";
  pfaValue.textContent = "--";
};

const setHoverReadout = ({ mean = "--", std = "--", value = "--" } = {}) => {
  hoverMean.textContent = mean;
  hoverStd.textContent = std;
  hoverMetricLabel.textContent = `Hovered ${activeMetric}`;
  hoverValue.textContent = value;
};

const parseInput = (input) => {
  const value = Number(input.value);

  if (!Number.isFinite(value)) {
    throw new Error(`Enter a valid number for ${input.name}.`);
  }

  if (value < MIN_VALUE || value > MAX_VALUE) {
    throw new Error(
      `${input.name} must be between ${MIN_VALUE.toFixed(2)} and ${MAX_VALUE.toFixed(2)}.`
    );
  }

  return value;
};

const buildSurfaceData = (table) => {
  const meanKeys = Object.keys(table).sort((left, right) => Number(left) - Number(right));
  const stdKeys = Object.keys(table[meanKeys[0]]).sort(
    (left, right) => Number(left) - Number(right)
  );

  const metrics = {};

  for (const metric of METRICS) {
    metrics[metric] = meanKeys.map((meanKey) =>
      stdKeys.map((stdKey) => {
        const entry = table[meanKey][stdKey];
        return metric === "PFA" ? entry.PFA ?? entry.PMFA : entry.PMA;
      })
    );
  }

  return {
    meanKeys,
    meanValues: meanKeys.map(Number),
    stdKeys,
    stdValues: stdKeys.map(Number),
    metrics
  };
};

const getMarkerTrace = () => {
  if (!activeSelection) {
    return {
      type: "scatter3d",
      mode: "markers",
      x: [],
      y: [],
      z: [],
      marker: {
        size: 0.1,
        color: "#ea5d3c"
      },
      hoverinfo: "skip",
      showlegend: false
    };
  }

  return {
    type: "scatter3d",
    mode: "markers",
    x: [Number(activeSelection.stdKey)],
    y: [Number(activeSelection.meanKey)],
    z: [activeSelection[activeMetric]],
    marker: {
      size: 7,
      color: "#ea5d3c",
      line: {
        color: "#fff8f2",
        width: 4
      }
    },
    name: "Lookup selection",
    hovertemplate:
      `Selected ${activeMetric}<br>` +
      "Mean %{y:.2f}<br>" +
      "Std %{x:.2f}<br>" +
      `${activeMetric} %{z:.4f}` +
      "<extra></extra>",
    showlegend: false
  };
};

const renderPlot = async () => {
  if (!surfaceData) {
    return;
  }

  if (!window.Plotly) {
    plotMeta.textContent = "Plot library failed to load.";
    return;
  }

  const surfaceTrace = {
    type: "surface",
    x: surfaceData.stdValues,
    y: surfaceData.meanValues,
    z: surfaceData.metrics[activeMetric],
    colorscale: [
      [0, "#dce8f1"],
      [0.35, "#89b0c9"],
      [0.7, "#2e6f95"],
      [1, "#ea5d3c"]
    ],
    contours: {
      z: {
        show: true,
        color: "rgba(16, 32, 51, 0.18)",
        width: 1
      }
    },
    hovertemplate:
      "Mean %{y:.2f}<br>" +
      "Std %{x:.2f}<br>" +
      `${activeMetric} %{z:.4f}` +
      "<extra></extra>",
    showscale: false
  };

  const layout = {
    margin: {
      l: 0,
      r: 0,
      b: 0,
      t: 0
    },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    scene: {
      bgcolor: "rgba(0,0,0,0)",
      aspectratio: {
        x: 1,
        y: 1,
        z: 0.7
      },
      xaxis: {
        title: "Std",
        range: [MIN_VALUE, MAX_VALUE],
        gridcolor: "rgba(16, 32, 51, 0.12)",
        zerolinecolor: "rgba(16, 32, 51, 0.12)"
      },
      yaxis: {
        title: "Mean",
        range: [MIN_VALUE, MAX_VALUE],
        gridcolor: "rgba(16, 32, 51, 0.12)",
        zerolinecolor: "rgba(16, 32, 51, 0.12)"
      },
      zaxis: {
        title: activeMetric,
        gridcolor: "rgba(16, 32, 51, 0.12)",
        zerolinecolor: "rgba(16, 32, 51, 0.12)"
      },
      camera: {
        eye: {
          x: 1.55,
          y: -1.7,
          z: 0.85
        }
      }
    }
  };

  const config = {
    responsive: true,
    displaylogo: false,
    modeBarButtonsToRemove: ["lasso3d", "select2d", "toggleSpikelines"],
    toImageButtonOptions: {
      format: "png",
      filename: "pma-pfa-surface"
    }
  };

  await window.Plotly.react(plotElement, [surfaceTrace, getMarkerTrace()], layout, config);

  if (!plotEventsBound) {
    plotElement.on("plotly_hover", (event) => {
      const [point] = event.points;

      if (!point) {
        return;
      }

      setHoverReadout({
        mean: Number(point.y).toFixed(2),
        std: Number(point.x).toFixed(2),
        value: formatResult(point.z)
      });
    });

    plotElement.on("plotly_unhover", () => {
      if (activeSelection) {
        setHoverReadout({
          mean: activeSelection.meanKey,
          std: activeSelection.stdKey,
          value: formatResult(activeSelection[activeMetric])
        });
        return;
      }

      setHoverReadout();
    });

    plotEventsBound = true;
  }

  plotMeta.textContent = activeSelection
    ? `Highlighted lookup at mean ${activeSelection.meanKey}, std ${activeSelection.stdKey}.`
    : "Hover the surface to inspect values from the local JSON table.";
};

const setMetric = async (metric) => {
  if (!METRICS.includes(metric)) {
    return;
  }

  activeMetric = metric;

  for (const metricButton of metricButtons) {
    metricButton.classList.toggle("is-active", metricButton.dataset.metric === metric);
  }

  if (activeSelection) {
    setHoverReadout({
      mean: activeSelection.meanKey,
      std: activeSelection.stdKey,
      value: formatResult(activeSelection[metric])
    });
  } else {
    setHoverReadout();
  }

  await renderPlot();
};

const lookupTablePromise = fetch("./errors.json").then(async (response) => {
  if (!response.ok) {
    throw new Error(`Lookup table request failed with ${response.status}.`);
  }

  return response.json();
});

lookupTablePromise
  .then(async (table) => {
    surfaceData = buildSurfaceData(table);
    setStatus("Lookup table ready.");
    await renderPlot();
  })
  .catch((error) => {
    setStatus(error.message, true);
    plotMeta.textContent = error.message;
  });

for (const metricButton of metricButtons) {
  metricButton.addEventListener("click", () => {
    void setMetric(metricButton.dataset.metric);
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setBusy(true);

  try {
    const mean = parseInput(meanInput);
    const std = parseInput(stdInput);
    const meanKey = formatKey(mean);
    const stdKey = formatKey(std);
    const table = await lookupTablePromise;
    const entry = table[meanKey]?.[stdKey];

    if (!entry) {
      throw new Error(`No lookup entry found for mean ${meanKey} and std ${stdKey}.`);
    }

    const pma = entry.PMA;
    const pfa = entry.PFA ?? entry.PMFA;

    if (typeof pma !== "number" || typeof pfa !== "number") {
      throw new Error(`Lookup entry for mean ${meanKey} and std ${stdKey} is malformed.`);
    }

    activeSelection = {
      meanKey,
      stdKey,
      PMA: pma,
      PFA: pfa
    };

    pmaValue.textContent = formatResult(pma);
    pfaValue.textContent = formatResult(pfa);
    lookupMeta.textContent = `Lookup used mean ${meanKey} and standard deviation ${stdKey}.`;
    setHoverReadout({
      mean: meanKey,
      std: stdKey,
      value: formatResult(activeSelection[activeMetric])
    });

    const rounded =
      Math.abs(mean - Number(meanKey)) > Number.EPSILON ||
      Math.abs(std - Number(stdKey)) > Number.EPSILON;
    setStatus(
      rounded
        ? "Inputs were rounded to the nearest 0.01 table entry."
        : "Values loaded from the local JSON lookup table."
    );

    await renderPlot();
  } catch (error) {
    setStatus(error.message, true);
    if (!activeSelection) {
      resetResults();
      lookupMeta.textContent = "No lookup performed yet.";
    }
  } finally {
    setBusy(false);
  }
});
