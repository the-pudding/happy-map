<script>
	import { Button } from "bits-ui";
	let {
		children,
		class: className, // "circle"
		variant = "default", // "default" | "primary" | "secondary" | "ghost" | "link" | "outline"
		size = "default", // "default" | "sm" | "lg" | "icon"
		href = undefined,
		disabled,
		...restProps
	} = $props();
</script>

<Button.Root
	{href}
	{disabled}
	class="bits-button {className}"
	{...restProps}
	data-size={size}
	data-variant={variant}
>
	{@render children?.()}
</Button.Root>

<style>
  :global(.bits-button) {
    background: var(--buttonbg);
    color: var(--buttontext);
    padding: 7px 15px;
    cursor: pointer;
    font-family: var(--sans);
    font-family: var(--handwriting);
    font-size: 14px;
    border-radius: 20px;
    border: var(--buttonborder);
    box-shadow: var(--buttonboxshadow);
    text-decoration: none;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  :global(.bits-button:hover)  {
    background: var(--buttonbg-hover);
  }
</style>