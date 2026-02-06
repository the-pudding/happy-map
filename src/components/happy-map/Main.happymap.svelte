<script>
  import { fade } from "svelte/transition";
  import { onMount } from "svelte";
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
  let filters = $state(structuredClone(DEFAULT_FILTERS));

  // --- MAP REF ---
  let mapComponent;

  // --- KEYBOARD NAVIGATION ---
  function handleKeydown(e) {
  // Don't handle keyboard nav when in explore mode (introStage >= copy.story.length)
  if (introStage >= copy.story.length) return;

  if (e.key === "ArrowRight") {
    e.preventDefault();
    if (introStage < copy.story.length - 1) {
      stepToggle(1);
    } else {
      // End of stepper, enter explore mode
      stepToggle(2);
    }
  } else if (e.key === "ArrowLeft") {
    e.preventDefault();
    if (introStage > 0) {
      stepToggle(-1);
    }
  }
}

  onMount(() => {
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  });

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
  // Handle "back to tour" - reset to beginning
  if (introStage + t < 0) {
    introStage = 0;
    const stageData = copy.story[0];
    mapComponent.flyTo(128, 128, getInitialZoom());
    mapComponent.animateOpacity(stageData?.isolate == 1 ? 0.3 : 1);
    return;
  }

  // Handle "Explore" button - move past story array to show "back to tour"
  if (t == 2) {
    introStage = copy.story.length; // Set to length, not length - 1
    storyActiveIndex = -1;
    popupInfo = null;
    mapComponent.animateOpacity(1);
    setTimeout(() => {
      mapComponent.focus();
    }, 100);
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

  if (introStage == 0) {
    mapComponent.flyTo(128, 128, getInitialZoom());
  } else if (stageData.targetId !== undefined) {
    mapComponent.flyToDot(Number(stageData.targetId), stageData.zoom);
  } else {
    mapComponent.flyTo(
      Number(stageData.lng) * 256,
      Number(stageData.lat) * 256,
      stageData.zoom
    );
  }
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

{#if introStage >= copy.story.length - 1}
  <button
    class="filterButton"
    class:shake={introStage === copy.story.length - 1}
    onclick={filterToggle}
    transition:fade
  >
    Filter
  </button>
  <button id="showinfo" onclick={() => infoToggle(!infoShown)} transition:fade>Info</button>
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
