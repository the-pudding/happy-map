<script>
  import { fade } from "svelte/transition";
  import FilterPanel from "$components/happy-map/Filter.happymap.svelte";
  import InfoPanel from "$components/happy-map/Info.happymap.svelte";
  import IntroText from "$components/happy-map/IntroText.happymap.svelte";
  import Map from "$components/happy-map/Map.happymap.svelte";

  import { getInitialZoom, DEFAULT_FILTERS } from "$components/helpers/textUtils.js";
  import copy from "$data/copy.json";

  // --- STATE ---
  let introStage = $state(0);
  let introShown = $state(true);
  let infoShown = $state(false);
  let isFilterPanelOpen = $state(false);

  let storyActiveIndex = $state(-1);
  let popupInfo = $state(null);

  let filters = $state({ ...DEFAULT_FILTERS });

  // --- MAP REF ---
  let mapComponent;

  // --- INIT ---
  function onMapReady() {
    const startStep = copy.story[introStage];
    if (startStep && startStep.targetId !== undefined) {
      storyActiveIndex = Number(startStep.targetId);
      setTimeout(() => {
        mapComponent.showPopupForDot(storyActiveIndex);
      }, 500);
    }
  }

  // --- NAVIGATION ---
  function stepToggle(t) {
    if (t == 2) {
      introShown = false;
      storyActiveIndex = -1;
      popupInfo = null;
      mapComponent.animateOpacity(1);
      return;
    }

    introStage += t;
    const stageData = copy.story[introStage];

    if (stageData.targetId !== undefined) {
      storyActiveIndex = Number(stageData.targetId);
      mapComponent.showPopupForDot(storyActiveIndex);
    } else {
      storyActiveIndex = -1;
      popupInfo = null;
    }

    mapComponent.animateOpacity(stageData?.isolate == 1 ? 0.3 : 1);

    const targetX = introStage == 0 ? 128 : Number(stageData.lng) * 256;
    const targetY = introStage == 0 ? 128 : Number(stageData.lat) * 256;
    const zoom = introStage == 0 ? getInitialZoom() : stageData.zoom;

    mapComponent.flyTo(targetX, targetY, zoom);
  }

  function infoToggle(x) {
    infoShown = x;
    if (x) isFilterPanelOpen = false;
  }

  function filterToggle() {
    isFilterPanelOpen = !isFilterPanelOpen;
    if (isFilterPanelOpen) infoShown = false;
  }
</script>

<div class="wrapper">
  <Map
    bind:this={mapComponent}
    {filters}
    {introShown}
    {introStage}
    bind:storyActiveIndex
    bind:popupInfo
    onReady={onMapReady}
  />
</div>

{#if !introShown}
  <button class="filterButton" onclick={filterToggle} transition:fade>Filter Responses</button>
  <button id="showinfo" onclick={() => infoToggle(!infoShown)} transition:fade>Show info</button>
  <FilterPanel bind:filters bind:isOpen={isFilterPanelOpen} />
  <InfoPanel bind:isOpen={infoShown} />
{/if}

{#if introShown}
  <div transition:fade>
    <IntroText {introStage} onStep={stepToggle} />
  </div>
{/if}

<style>
  .wrapper {
    position: absolute;
    bottom: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background-color: #1e3d54;
    z-index: 1;
    overflow: hidden;
  }
</style>
