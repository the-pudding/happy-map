<script>
  import Text from "$components/happy-map/Text.happymap.svelte";
  import copy from "$data/copy.json";

  let { isOpen = $bindable() } = $props();

  function close() {
    isOpen = false;
  }
</script>

{#if isOpen}
  <div class="infoPanel">
    <button class="close-panel-btn" onclick={close}>×</button>
    <h1>happy map</h1>
    <div class="byline">
      by <a href="https://pudding.cool/author/alvin-chang/" target="_blank">alvin chang</a>
    </div>
    <div class="info-content">
      <Text copy={copy.info} />
    </div>
  </div>
{/if}

<style>
  .infoPanel {
    font-family: var(--sans);
    position: absolute;
    right: 0;
    top: 0;
    height: 100vh;
    width: 350px;
    padding: 60px 25px 25px;
    background: var(--paneldark);
    color: white;
    z-index: 99999;
    border-left: 1px solid #264a5c;
    box-shadow: -5px 0 15px rgba(0, 0, 0, 0.5);
    overflow-y: auto;
  }

  .infoPanel h1 {
    font-size: 22px;
    /* color: #ffec70; */
    margin: 0 0 10px 0;
    line-height: 1;
    font-family: var(--handwriting);
    font-weight: 300;
  }

  .infoPanel .byline {
    font-size: 13px;
    /* color: #8db1b3; */
    margin-bottom: 25px;
    border-bottom: 1px solid #264a5c;
    padding-bottom: 15px;
  }

  .infoPanel :global(a) {
    color: var(--hlcolor);
    text-decoration: none;
    border-bottom: 1px dotted var(--hlcolor);
  }

  .infoPanel :global(a:hover) {
    border-bottom: 1px solid var(--hlcolor);
  }

  .infoPanel :global(h4) {
    margin: 25px 0 10px 0;
    font-size: 13px;
    font-weight: bold;
    color: var(--panelhl);
    text-transform: uppercase;
    letter-spacing: 1px;
    border-bottom: 1px solid #264a5c;
    padding-bottom: 5px;
  }

  .infoPanel :global(p) {
    font-size: 13px;
    line-height: 1.5;
    color: #cbd5e1;
    margin-bottom: 15px;
  }

/*   .infoPanel :global(p span) {
    color: #ffec70;
    font-weight: bold;
  } */

/*   .infoPanel :global(.cite) {
    font-size: 12px;
    color: #8db1b3;
    font-style: italic;
  } */

  .infoPanel :global(.links) {
    font-size: 12px;
  }

  .close-panel-btn {
    position: absolute;
    top: 10px;
    left: 15px;
    background: none;
    border: none;
    color: #5aa6cf;
    font-size: 24px;
    cursor: pointer;
    line-height: 1;
    padding: 0;
  }
</style>
