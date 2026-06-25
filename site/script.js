const form = document.querySelector("#lookup-form");
const maeInput = document.querySelector("#mae");
const stdInput = document.querySelector("#std");
const button = document.querySelector("#lookup-button");
const status = document.querySelector("#status");
const lookupMeta = document.querySelector("#lookup-meta");
const pmaValue = document.querySelector("#pma-value");
const pfaValue = document.querySelector("#pfa-value");
const tableMeta = document.querySelector("#table-meta");
const tableHead = document.querySelector("#table-head");
const tableBody = document.querySelector("#table-body");
const filterPmaInput = document.querySelector("#filter-pma");
const filterPfaInput = document.querySelector("#filter-pfa");

const MIN_VALUE = 0;
const MAX_VALUE = 1;

let normalizedData = null;
let activeSelectionKey = null;

const formatLookupKey = (value) => (Math.round(value * 100) / 100).toFixed(2);
const formatDisplayNumber = (value) =>
  Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4
  });
const escapeRowKey = (value) => value.replace(/[^a-zA-Z0-9_-]/g, "-");

const setBusy = (isBusy) => {
  button.disabled = isBusy;
  button.textContent = isBusy ? "Looking Up…" : "Calculate Errors";
};

const setStatus = (message, isError = false) => {
  status.textContent = message;
  status.style.color = isError ? "#b42318" : "";
};

const resetResults = () => {
  pmaValue.textContent = "--";
  pfaValue.textContent = "--";
  pmaValue.classList.remove("is-over-limit");
  pfaValue.classList.remove("is-over-limit");
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

const parseFilterInput = (input) => {
  const rawValue = input.value.trim();

  if (!rawValue) {
    input.classList.remove("is-invalid");
    return null;
  }

  const value = Number(rawValue);
  const isValid = Number.isFinite(value) && value >= MIN_VALUE && value <= MAX_VALUE;
  input.classList.toggle("is-invalid", !isValid);

  return isValid ? value : null;
};

const isScenarioValue = (value) =>
  value &&
  typeof value === "object" &&
  (Number.isFinite(value.PMA) || Number.isFinite(value.PFA) || Number.isFinite(value.PMFA));

const computeMax = (values) => {
  const finiteValues = values.filter(Number.isFinite);
  return finiteValues.length ? Math.max(...finiteValues) : null;
};

const normalizeTable = (table) => {
  const rows = [];
  const lookup = new Map();
  const scenarioNames = new Set();
  const metaFields = new Set();

  const maeKeys = Object.keys(table).sort((left, right) => Number(left) - Number(right));

  for (const maeKey of maeKeys) {
    const stdEntries = table[maeKey];
    const stdKeys = Object.keys(stdEntries).sort((left, right) => Number(left) - Number(right));

    for (const stdKey of stdKeys) {
      const rawEntry = stdEntries[stdKey];
      const scenarios = {};
      const meta = {};

      for (const [key, value] of Object.entries(rawEntry)) {
        if (isScenarioValue(value)) {
          scenarios[key] = {
            PMA: Number.isFinite(value.PMA) ? Number(value.PMA) : null,
            PFA: Number.isFinite(value.PFA ?? value.PMFA) ? Number(value.PFA ?? value.PMFA) : null
          };
          scenarioNames.add(key);
          continue;
        }

        meta[key] = value;
        metaFields.add(key);
      }

      const scenarioValues = Object.values(scenarios);
      const maxPMA = computeMax(scenarioValues.map((scenario) => scenario.PMA));
      const maxPFA = computeMax(scenarioValues.map((scenario) => scenario.PFA));
      const normalizedMae = formatLookupKey(Number(maeKey));
      const normalizedStd = formatLookupKey(Number(stdKey));
      const rowKey = `${normalizedMae}-${normalizedStd}`;

      const row = {
        key: rowKey,
        maeKey,
        stdKey,
        normalizedMae,
        normalizedStd,
        meta,
        scenarios,
        scenarioCount: scenarioValues.length,
        maxPMA,
        maxPFA
      };

      rows.push(row);
      lookup.set(rowKey, row);
    }
  }

  return {
    rows,
    lookup,
    scenarioNames: [...scenarioNames].sort((left, right) => left.localeCompare(right)),
    metaFields: [...metaFields].sort((left, right) => left.localeCompare(right))
  };
};

const createCell = (tagName, text, className = "") => {
  const cell = document.createElement(tagName);
  cell.textContent = text;

  if (className) {
    cell.className = className;
  }

  return cell;
};

const getActiveFilters = () => ({
  maxPMA: parseFilterInput(filterPmaInput),
  maxPFA: parseFilterInput(filterPfaInput)
});

const rowPassesFilters = (row, filters) => {
  const passesPMA = filters.maxPMA == null || row.maxPMA == null || row.maxPMA <= filters.maxPMA;
  const passesPFA = filters.maxPFA == null || row.maxPFA == null || row.maxPFA <= filters.maxPFA;
  return passesPMA && passesPFA;
};

const getRowLimitState = (row, filters) => ({
  exceedsPMA: filters.maxPMA != null && row.maxPMA != null && row.maxPMA > filters.maxPMA,
  exceedsPFA: filters.maxPFA != null && row.maxPFA != null && row.maxPFA > filters.maxPFA
});

const renderTable = () => {
  if (!normalizedData) {
    return;
  }

  const filters = getActiveFilters();
  tableHead.textContent = "";
  tableBody.textContent = "";

  const headerRow = document.createElement("tr");
  const headers = [
    "MAE",
    "Std",
    ...normalizedData.metaFields,
    "Max PMA",
    "Max PFA",
    ...normalizedData.scenarioNames
  ];

  for (const header of headers) {
    headerRow.append(createCell("th", header));
  }

  tableHead.append(headerRow);

  const fragment = document.createDocumentFragment();
  let shownRows = 0;

  for (const row of normalizedData.rows) {
    const passesFilters = rowPassesFilters(row, filters);
    const shouldForceVisible = activeSelectionKey === row.key;

    if (!passesFilters && !shouldForceVisible) {
      continue;
    }

    shownRows += 1;
    const tr = document.createElement("tr");
    tr.id = `row-${escapeRowKey(row.key)}`;
    tr.dataset.lookupKey = row.key;
    const limitState = getRowLimitState(row, filters);

    tr.append(createCell("td", row.normalizedMae, "mono"));
    tr.append(createCell("td", row.normalizedStd, "mono"));

    for (const metaField of normalizedData.metaFields) {
      const value = row.meta[metaField];
      tr.append(createCell("td", value == null ? "—" : String(value), "mono"));
    }

    const maxPmaCell = createCell(
      "td",
      row.maxPMA == null ? "—" : formatDisplayNumber(row.maxPMA),
      "mono"
    );
    const maxPfaCell = createCell(
      "td",
      row.maxPFA == null ? "—" : formatDisplayNumber(row.maxPFA),
      "mono"
    );

    if (limitState.exceedsPMA) {
      maxPmaCell.classList.add("is-over-limit");
    }

    if (limitState.exceedsPFA) {
      maxPfaCell.classList.add("is-over-limit");
    }

    tr.append(maxPmaCell);
    tr.append(maxPfaCell);

    for (const scenarioName of normalizedData.scenarioNames) {
      const scenario = row.scenarios[scenarioName];
      const text = scenario
        ? `PMA ${
            scenario.PMA == null ? "—" : formatDisplayNumber(scenario.PMA)
          } / PFA ${scenario.PFA == null ? "—" : formatDisplayNumber(scenario.PFA)}`
        : "—";

      tr.append(createCell("td", text, "scenario-cell"));
    }

    fragment.append(tr);
  }

  tableBody.append(fragment);
  highlightRow(activeSelectionKey);

  tableMeta.textContent =
    shownRows === normalizedData.rows.length
      ? `${shownRows} rows loaded.`
      : `${shownRows} of ${normalizedData.rows.length} rows shown.`;
};

const highlightRow = (lookupKey) => {
  const previousRow = tableBody.querySelector(".is-selected");

  if (previousRow) {
    previousRow.classList.remove("is-selected");
  }

  if (!lookupKey) {
    return;
  }

  const row = document.querySelector(`#row-${escapeRowKey(lookupKey)}`);

  if (!row) {
    return;
  }

  row.classList.add("is-selected");
  row.scrollIntoView({
    behavior: "smooth",
    block: "center",
    inline: "nearest"
  });
};

const lookupTablePromise = fetch("./errors2.json").then(async (response) => {
  if (!response.ok) {
    throw new Error(`Lookup table request failed with ${response.status}.`);
  }

  return response.json();
});

lookupTablePromise
  .then((table) => {
    normalizedData = normalizeTable(table);
    renderTable();
    setStatus("Lookup table ready.");
  })
  .catch((error) => {
    setStatus(error.message, true);
    tableMeta.textContent = error.message;
  });

const updateSelectedValueStyling = (row) => {
  if (!row) {
    pmaValue.classList.remove("is-over-limit");
    pfaValue.classList.remove("is-over-limit");
    return;
  }

  const filters = getActiveFilters();
  const limitState = getRowLimitState(row, filters);
  pmaValue.classList.toggle("is-over-limit", limitState.exceedsPMA);
  pfaValue.classList.toggle("is-over-limit", limitState.exceedsPFA);
};

const refreshTableWithFilters = () => {
  if (!normalizedData) {
    return;
  }

  renderTable();

  if (activeSelectionKey) {
    const row = normalizedData.lookup.get(activeSelectionKey);
    updateSelectedValueStyling(row);
  }
};

for (const filterInput of [filterPmaInput, filterPfaInput]) {
  filterInput.addEventListener("input", () => {
    refreshTableWithFilters();
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setBusy(true);

  try {
    const mae = parseInput(maeInput);
    const std = parseInput(stdInput);
    const lookupKey = `${formatLookupKey(mae)}-${formatLookupKey(std)}`;
    const table = await lookupTablePromise;

    if (!normalizedData) {
      normalizedData = normalizeTable(table);
      renderTable();
    }

    const row = normalizedData.lookup.get(lookupKey);

    if (!row) {
      throw new Error(
        `No lookup entry found for MAE ${formatLookupKey(mae)} and std ${formatLookupKey(std)}.`
      );
    }

    activeSelectionKey = lookupKey;
    pmaValue.textContent =
      row.maxPMA == null ? "—" : formatDisplayNumber(row.maxPMA);
    pfaValue.textContent =
      row.maxPFA == null ? "—" : formatDisplayNumber(row.maxPFA);
    updateSelectedValueStyling(row);
    lookupMeta.textContent =
      `Lookup used MAE ${row.normalizedMae} and standard deviation ${row.normalizedStd}.`;

    const rounded =
      Math.abs(mae - Number(row.normalizedMae)) > Number.EPSILON ||
      Math.abs(std - Number(row.normalizedStd)) > Number.EPSILON;

    setStatus(
      rounded
        ? "Inputs were rounded to the nearest 0.01 table entry."
        : "Values loaded."
    );

    renderTable();
  } catch (error) {
    setStatus(error.message, true);

    if (!activeSelectionKey) {
      resetResults();
      lookupMeta.textContent = "No lookup performed yet.";
    }
  } finally {
    setBusy(false);
  }
});
