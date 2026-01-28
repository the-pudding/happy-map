<script>
  import Text from "$components/happy-map/Text.happymap.svelte";
  import copy from "$data/copy.json";

  let { introStage, onStep } = $props();
</script>

<div class="introText">
  <Text copy={copy.story[introStage].text} />
  <div class="buttonContainer">
    {#if introStage > 0}
      <button class="prev" onclick={() => onStep(-1)}>Back</button>
    {/if}
    {#if introStage < copy.story.length - 1}
      <button class="next" onclick={() => onStep(1)}>Next</button>
    {:else}
      <button class="explore next" onclick={() => onStep(2)}>Explore</button>
    {/if}
  </div>
</div>

<style>
  .introText {
    position: absolute;
    z-index: 999999;
    background: #001124;
    left: 20px;
    bottom: 20px;
    width: 320px;
    padding: 30px;
    font-family: var(--sans);
    font-size: 15px;
    color: white;
  }

  .introText :global(h1) {
    font-size: 20px;
    color: #ffec70;
    line-height: 15px;
    margin: 0 0 20px 0;
    text-align: center;
  }

  .introText :global(.byline) {
    font-size: 13px;
    line-height: 15px;
    margin: 0 0 20px 0;
    text-align: center;
    text-decoration: none;
  }

  .introText :global(p) {
    font-size: 13px;
    line-height: 22px;
    color: #dff4f5;
  }

  .introText :global(a) {
    color: #eb8aff;
    text-decoration: none;
    border-bottom: 1px dotted #57bff2;
  }

  .introText :global(a:hover) {
    color: #68ddde;
    text-decoration: none;
    border-bottom: 1px solid #4da7a8;
  }

  .introText :global(.byline a) {
    color: #eb8aff !important;
    border-bottom: 1px dotted #f263ff;
  }

  .introText :global(.byline a:hover) {
    color: #f263ff !important;
    border-bottom: 1px dotted #b200c2;
  }

  .introText :global(.introSpan) {
    color: #ffec70;
  }

  .introText :global(.cite) {
    font-size: 11px;
    line-height: 14px;
    margin-top: 10px;
    color: #8db1b3;
    font-style: italic;
  }

  .buttonContainer {
    width: 100%;
    height: 40px;
    position: relative;
  }

  .introText button {
    position: absolute;
    width: calc(50% - 5px);
    background: #1badf5;
    color: white;
    bottom: 0;
    height: 100%;
  }

  .introText button:hover {
    background: #1682b8;
  }

  .introText button.next {
    right: 0;
  }

  .introText button.prev {
    left: 0;
    background: #646a6e;
  }
</style>
