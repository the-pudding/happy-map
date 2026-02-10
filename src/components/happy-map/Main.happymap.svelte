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

  // --- NEW: Loading State ---
  let isLoading = $state(true);

  // --- MAP REF ---
  let mapComponent;

  // --- OPTIMIZED PRELOADING ---
  // 1. Load essentials immediately
  function preloadCriticalImages() {
    const imagesToLoad = new Set([
      "assets/app/chart1.svg",
      "assets/app/chart1_mobile.svg",
      "assets/app/chart2.svg",
      "assets/app/chart2_mobile.svg",
      "assets/icons/narrator_front.png",
      "assets/icon-atlas.png"
    ]);

    // Only first 2 slides
    copy.story.slice(0, 2).forEach((step) => {
      if (step.icon) imagesToLoad.add(`assets/icons/narrator_${step.icon}.png`);
      if (step.text) {
        const match = step.text.match(/src=["'](.*?)["']/);
        if (match && match[1]) imagesToLoad.add(match[1]);
      }
    });

    imagesToLoad.forEach((src) => (new Image().src = src));
  }

  // 2. Load the rest in background after map is ready
  function preloadBackgroundImages() {
    const imagesToLoad = new Set();
    copy.story.slice(2).forEach((step) => {
      if (step.icon) imagesToLoad.add(`assets/icons/narrator_${step.icon}.png`);
      if (step.text) {
        const match = step.text.match(/src=["'](.*?)["']/);
        if (match && match[1]) imagesToLoad.add(match[1]);
      }
    });

    // Slight delay to not freeze the fade-in animation
    setTimeout(() => {
      imagesToLoad.forEach((src) => (new Image().src = src));
    }, 1000);
  }

  // --- KEYBOARD NAVIGATION ---
  function handleKeydown(e) {
    // Disable keyboard if loading or in explore mode
    if (isLoading || introStage >= copy.story.length) return;

    if (e.key === "ArrowRight") {
      e.preventDefault();
      if (introStage < copy.story.length - 1) {
        stepToggle(1);
      } else {
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
    preloadCriticalImages();
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  });

  // --- INIT ---
  function onMapReady() {
    // Start loading the rest of the images
    preloadBackgroundImages();

    // Map component will set isLoading=false internally when tiles load,
    // but we can ensure it here just in case logic differs.
    // (Binding handles the main toggle).

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
    if (introStage + t < 0) {
      introStage = 0;
      const stageData = copy.story[0];
      mapComponent.flyTo(128, 128, getInitialZoom());
      mapComponent.animateOpacity(stageData?.isolate == 1 ? 0.3 : 1);
      return;
    }

    if (t == 2) {
      introStage = copy.story.length;
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
    bind:isLoading={isLoading}
    {filters}
    {introShown}
    {introStage}
    bind:storyActiveIndex
    bind:popupInfo
    onReady={onMapReady}
  />

  {#if isLoading}
    <div class="loader-container" transition:fade>
      <div class="spinner"></div>
      <div class="loading-text">Loading Map...</div>
    </div>
  {/if}
</div>

{#if !isLoading}
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

  /* LOADING STYLES */
  .loader-container {
    position: absolute;
    inset: 0;
    background: #1e3d54;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: 9999;
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 4px solid rgba(255, 255, 255, 0.3);
    border-top: 4px solid #fff;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 15px;
  }

  .loading-text {
    font-family: var(--handwriting, sans-serif); /* Fallback to sans-serif */
    color: white;
    font-size: 18px;
    opacity: 0.8;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
</style>
