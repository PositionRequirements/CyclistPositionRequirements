const form = document.querySelector("#lookup-form");
const meanInput = document.querySelector("#mean");
const stdInput = document.querySelector("#std");
const button = document.querySelector("#lookup-button");
const status = document.querySelector("#status");
const lookupMeta = document.querySelector("#lookup-meta");
const pmaValue = document.querySelector("#pma-value");
const pfaValue = document.querySelector("#pfa-value");

const MIN_VALUE = 0.01;
const MAX_VALUE = 1;

const formatKey = (value) => (Math.round(value * 100) / 100).toFixed(2);
const formatResult = (value) =>
  Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4
  });

const lookupTablePromise = fetch("./errors.json").then(async (response) => {
  if (!response.ok) {
    throw new Error(`Lookup table request failed with ${response.status}.`);
  }

  return response.json();
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

lookupTablePromise
  .then(() => {
    setStatus("Lookup table ready.");
  })
  .catch((error) => {
    setStatus(error.message, true);
  });

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  resetResults();
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

    pmaValue.textContent = formatResult(pma);
    pfaValue.textContent = formatResult(pfa);
    lookupMeta.textContent = `Lookup used mean ${meanKey} and standard deviation ${stdKey}.`;

    const rounded =
      Math.abs(mean - Number(meanKey)) > Number.EPSILON ||
      Math.abs(std - Number(stdKey)) > Number.EPSILON;
    setStatus(
      rounded
        ? "Inputs were rounded to the nearest 0.01 table entry."
        : "Values loaded from the local JSON lookup table."
    );
  } catch (error) {
    setStatus(error.message, true);
    lookupMeta.textContent = "No lookup performed yet.";
  } finally {
    setBusy(false);
  }
});
