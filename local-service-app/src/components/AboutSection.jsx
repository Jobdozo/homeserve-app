import { SectionTitle } from "./ui";

// "About AC Repair": written in Super Admin → Services & Categories (category and city pages).
// Nothing is shown until someone writes it — the site never shows invented text.
export default function AboutSection({ title, text, className = "px-4 pt-7" }) {
  if (!String(text || "").trim()) return null;
  return (
    <section className={className}>
      <SectionTitle>{title}</SectionTitle>
      <div className="mt-3 space-y-2.5 rounded-[20px] bg-white p-4 text-[13.5px] leading-relaxed text-ink-muted shadow-card">
        {String(text)
          .split(/\n{2,}/)
          .map((para, i) => (
            <p key={i} className="whitespace-pre-line">
              {para}
            </p>
          ))}
      </div>
    </section>
  );
}
