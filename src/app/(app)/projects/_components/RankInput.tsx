"use client";

/**
 * Position input that submits on Enter or blur — NOT on every keystroke, which would fire a
 * reorder for the "1" in "12". Skips the submit when the value is unchanged so tabbing through
 * a stage doesn't trigger pointless round-trips.
 */
export function RankInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      type="number"
      onKeyDown={(e) => {
        props.onKeyDown?.(e);
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur(); // blur handler submits, so Enter and click-away behave alike
        }
      }}
      onBlur={(e) => {
        props.onBlur?.(e);
        if (e.currentTarget.value !== String(props.defaultValue ?? "")) {
          e.currentTarget.form?.requestSubmit();
        }
      }}
    />
  );
}
