import { COUNTRY_CODES } from "../data/countryCodes";

export default function PhoneInput({ country, onCountryChange, number, onNumberChange, autoFocus }) {
  return (
    <div className="flex gap-2">
      <select
        value={country}
        onChange={(e) => onCountryChange(e.target.value)}
        aria-label="Country code"
        className="w-[104px] flex-shrink-0 rounded-xl border border-gray-200 px-2 text-[14px] text-gray-800 focus:border-brand focus:outline-none"
      >
        {COUNTRY_CODES.map((c) => (
          <option key={c.iso2} value={c.iso2}>
            {c.flag} {c.dial}
          </option>
        ))}
      </select>
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
