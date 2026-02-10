<script>
  import { convertCountries } from "$components/helpers/textUtils.js";

  let { popupInfo = $bindable() } = $props();
  const marriedlookup = {
    "m": "Married",
    "s":  "Single",
    "d": "Divorced",
    "-": "--"
  }

  function close() {
    popupInfo = null;
  }
</script>

{#if popupInfo}
  <div
    class="popup-container"
    style="left: {popupInfo.x}px; top: {popupInfo.y}px;"
  >
    <div class="popup-content">
      <button class="popup-close" onclick={close}>×</button>
      <div class="info">
        {Math.round(popupInfo.data[3])} / {popupInfo.data[5].toUpperCase()} / {convertCountries(
          popupInfo.data[4])}
        <br />
        <span>
          {marriedlookup[popupInfo.data[6]]} /
          {popupInfo.data[7] == 1 ? "Parent" : "Not a parent"}
        </span>
       <!--  {#if popupInfo.data._stableId !== undefined}
          <br /><span class="debug-id">ID: {popupInfo.data._stableId}</span>
          <br /><span class="debug-id">Coords: {popupInfo.data[0]}, {popupInfo.data[1]}</span>
        {/if} -->
      </div>
      <div class="quote">{popupInfo.data[2]}</div>
    </div>
  </div>
{/if}

<style>
  .popup-container {
    position: absolute;
    transform: translate(-50%, -100%);
    z-index: 100;
    pointer-events: auto;
    padding-bottom: 20px;
  }

  .popup-content {
    background: var(--popupbg);
    color: #333;
    padding: 10px;
    border-radius: 4px;
    box-shadow: 0 3px 14px rgba(0, 0, 0, 0.4);
    width: 280px;
    font-family: var(--sans);
    position: relative;
  }

  .popup-content::after {
    content: "";
    position: absolute;
    bottom: -7px;
    left: 50%;
    transform: translateX(-50%);
    border-width: 8px 8px 0;
    border-style: solid;
    border-color: var(--popupbg) transparent transparent transparent;
  }

  .popup-close {
    position: absolute;
    top: 5px;
    right: 5px;
    background: none;
    border: none;
    font-size: 16px;
    cursor: pointer;
    color: #666;
  }

  .popup-content .info {
    font-size: 13px;
    color: #000;
    margin-bottom: 5px;
    border-bottom: 1px solid #eee;
    padding-bottom: 2px;
    /* text-transform: uppercase; */
    letter-spacing: 0px;
  }

  .popup-content .info span {
    color: #888;
    /* text-transform: none; */
  }

  .popup-content .quote {
    font-size: 14px;
    line-height: 1.3em;
    color: #000;
    /* font-family: var(--serif); */
     /* font-family: var(--handwriting); */
  }

  .debug-id {
    font-size: 9px;
    color: #88a;
    letter-spacing: 0.5px;
    display: block;
    margin-top: 2px;
  }
</style>
