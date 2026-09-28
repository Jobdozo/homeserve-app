import { COUNTRY_CODES } from "../data/countryCodes";

// India-only launch: the country is fixed, so this shows a plain +91 badge
// instead of a dropdown. `country`/`onCountryChange` are accepted but unused
// so callers don't need to change — restore the <select> here if a second
// country is ever added to countryCodes.js.
export default function PhoneInput({ number, onNumberChange, autoFocus }) {
  const { flag, dial, name } = COUNTRY_CODES[0];
  return (
    <div className="flex gap-2">
      <span
        title={name}
        aria-label={`Country: ${name}, ${dial}`}
        className="flex w-[68px] flex-shrink-0 items-center justify-center gap-1 rounded-xl border border-gray-200 px-2 text-[14px] text-gray-800"
      >
        <span aria-hidden="true">{flag}</span> {dial}
      </span>
      <input
        type="tel"
        inputMode="numeric"
        autoFocus={autoFocus}
        value={number}
        onChange={(e) => onNumberChange(e.target.value.replace(/\D/g, ""))}
        placeholder="98765 43210"
        className="min-w-0 flex-1 rounded-xl border border-gray-200 px-4 py-3 text-[14px] focus:border-brand focus:outline-none"
      />
    </div>
  );
}
