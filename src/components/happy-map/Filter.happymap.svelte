<script>
  let { filters = $bindable(), isOpen = $bindable() } = $props();

  // Ensure search property exists (just in case)
  if (typeof filters.search === "undefined") {
    filters.search = "";
  }

  function toggleGroup(groupKey, turnOn) {
    const newFilters = { ...filters };
    const currentGroup = { ...newFilters[groupKey] };

    Object.keys(currentGroup).forEach((key) => {
      currentGroup[key] = turnOn;
    });

    newFilters[groupKey] = currentGroup;
    filters = newFilters;
  }

  function clearSearch() {
    filters.search = "";
  }

  function close() {
    isOpen = false;
  }
</script>

{#if isOpen}
  <div class="filterPanel open">
    <div class="panel-header">
      <button class="close-panel-btn" onclick={close}>×</button>
      <h4>Filter Responses</h4>
    </div>

    <div class="panel-content">
      <div class="filter-group">
        <div class="group-header">
          <div class="group-title">Search Text</div>
        </div>
        <div class="search-wrapper">
          <input
            type="text"
            class="search-input"
            placeholder="Type to search..."
            bind:value={filters.search}
          />
          {#if filters.search && filters.search.length > 0}
            <button class="clear-search-btn" onclick={clearSearch} aria-label="Clear search">×</button>
          {/if}
        </div>
      </div>

      <div class="filter-group">
        <div class="group-header">
          <div class="group-title">Location</div>
          <div class="group-actions">
            <button onclick={() => toggleGroup("location", true)}>All</button>
            <button onclick={() => toggleGroup("location", false)}>None</button>
          </div>
        </div>
        <label>
          <input type="checkbox" bind:checked={filters.location.us} /> U.S.
        </label>
        <label>
          <input type="checkbox" bind:checked={filters.location.nonUs} /> Non-U.S.
        </label>
      </div>

      <div class="filter-group">
        <div class="group-header">
          <div class="group-title">Age</div>
          <div class="group-actions">
            <button onclick={() => toggleGroup("age", true)}>All</button>
            <button onclick={() => toggleGroup("age", false)}>None</button>
          </div>
        </div>
        <label>
          <input type="checkbox" bind:checked={filters.age.range1} /> Under 20
        </label>
        <label>
          <input type="checkbox" bind:checked={filters.age.range2} /> 20 - 29
        </label>
        <label>
          <input type="checkbox" bind:checked={filters.age.range3} /> 30 - 39
        </label>
        <label>
          <input type="checkbox" bind:checked={filters.age.range4} /> 40 - 49
        </label>
        <label>
          <input type="checkbox" bind:checked={filters.age.range5} /> 50 - 59
        </label>
        <label>
          <input type="checkbox" bind:checked={filters.age.range6} /> 60 - 69
        </label>
        <label>
          <input type="checkbox" bind:checked={filters.age.range7} /> 70+
        </label>
      </div>

      <div class="filter-group">
        <div class="group-header">
          <div class="group-title">Sex</div>
          <div class="group-actions">
            <button onclick={() => toggleGroup("sex", true)}>All</button>
            <button onclick={() => toggleGroup("sex", false)}>None</button>
          </div>
        </div>
        <label>
          <input type="checkbox" bind:checked={filters.sex.m} /> Male
        </label>
        <label>
          <input type="checkbox" bind:checked={filters.sex.f} /> Female
        </label>
        <label>
          <input type="checkbox" bind:checked={filters.sex.o} /> Other
        </label>
      </div>

      <div class="filter-group">
        <div class="group-header">
          <div class="group-title">Parental Status</div>
          <div class="group-actions">
            <button onclick={() => toggleGroup("parent", true)}>All</button>
            <button onclick={() => toggleGroup("parent", false)}>None</button>
          </div>
        </div>
        <label>
          <input type="checkbox" bind:checked={filters.parent.yes} /> Parent
        </label>
        <label>
          <input type="checkbox" bind:checked={filters.parent.no} /> Not Parent
        </label>
      </div>

      <div class="filter-group">
        <div class="group-header">
          <div class="group-title">Marital Status</div>
          <div class="group-actions">
            <button onclick={() => toggleGroup("marital", true)}>All</button>
            <button onclick={() => toggleGroup("marital", false)}>None</button>
          </div>
        </div>
        <label>
          <input type="checkbox" bind:checked={filters.marital.single} /> Single
        </label>
        <label>
          <input type="checkbox" bind:checked={filters.marital.married} /> Married
        </label>
        <label>
          <input type="checkbox" bind:checked={filters.marital.divorced} /> Divorced
        </label>
      </div>
    </div>
  </div>
{/if}

<style>
  .filterPanel {
    font-family: var(--sans);
    position: absolute;
    right: 0;
    top: 0;
    height: 100vh;
    width: 240px;
    background: var(--paneldark);
    color: white;
    z-index: 99999;
    border-left: 1px solid var(--panelborder);
    box-shadow: -5px 0 15px rgba(0, 0, 0, 0.5);
    display: flex;
    flex-direction: column;
  }

  .panel-header {
    position: sticky;
    top: 0;
    background: var(--paneldark);
    padding: 15px;
    padding-top: 45px;
    border-bottom: 1px solid var(--panelborder);
    flex-shrink: 0;
    z-index: 1;
  }

  .panel-header h4 {
    margin: 0;
    font-size: 13px;
    font-weight: bold;
  }

  .panel-content {
    flex: 1;
    overflow-y: auto;
    padding: 15px;
    padding-bottom: 150px;
  }

  @media (max-width: 800px) {
    .panel-content {
      padding-bottom: 250px;
    }
  }

  .filter-group {
    margin-bottom: 15px;
  }

  .group-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .group-title {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--panelhl);
    font-weight: bold;
  }

  .group-actions button {
    background: none;
    border: none;
    color: var(--panelbutton);
    font-size: 10px;
    cursor: pointer;
    padding: 0 4px;
    text-transform: uppercase;
  }

  .group-actions button:hover {
    color: white;
    text-decoration: underline;
  }

  .filterPanel label {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
    cursor: pointer;
    font-size: 13px;
    color: var(--panellabel);
    user-select: none;
  }

  .filterPanel label:hover {
    color: white;
  }

  .filterPanel input[type="checkbox"] {
    -webkit-appearance: none;
    appearance: none;
    margin: 0;
    width: 18px;
    height: 18px;
    border: 1px solid var(--panelhl);
    border-radius: 3px;
    background-color: rgba(0, 36, 54, 0.5);
    display: grid;
    place-content: center;
    cursor: pointer;
    flex-shrink: 0;
    transition: all 0.2s;
  }

  .filterPanel input[type="checkbox"]:hover {
    border-color: var(--panelhl);
    background-color: rgba(158, 255, 220, 0.1);
  }

  .filterPanel input[type="checkbox"]::before {
    content: "";
    width: 10px;
    height: 10px;
    transform: scale(0);
    transition: 0.1s transform;
    background-color: var(--paneldark);
    clip-path: polygon(14% 44%, 0 65%, 50% 100%, 100% 16%, 80% 0%, 43% 62%);
    box-shadow: inset 1em 1em var(--paneldark);
  }

  .filterPanel input[type="checkbox"]:checked {
    background-color: var(--panelhl);
    border-color: var(--panelhl);
  }

  .filterPanel input[type="checkbox"]:checked::before {
    transform: scale(1);
  }

  .close-panel-btn {
    position: absolute;
    top: 10px;
    left: 15px;
    background: none;
    border: none;
    color: var(--panelhl);
    font-size: 24px;
    cursor: pointer;
    line-height: 1;
    padding: 0;
  }

  .search-wrapper {
    position: relative;
    width: 100%;
  }

  .search-input {
    width: 100%;
    background-color: rgba(0, 36, 54, 0.5);
    border: 1px solid var(--panelhl);
    border-radius: 4px;
    padding: 8px 10px;
    padding-right: 30px;
    color: white;
    font-size: 13px;
    font-family: inherit;
    outline: none;
    transition: border-color 0.2s;
    box-sizing: border-box;
  }

  .search-input:focus {
    border-color: var(--panelhl);
    background-color: rgba(0, 36, 54, 0.8);
  }

  .search-input::placeholder {
    color: var(--panelhl);
    opacity: 0.7;
  }

  .clear-search-btn {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    color: var(--panelhl);
    font-size: 18px;
    cursor: pointer;
    line-height: 1;
    padding: 0;
    transition: color 0.2s;
  }

  .clear-search-btn:hover {
    color: white;
  }
</style>
