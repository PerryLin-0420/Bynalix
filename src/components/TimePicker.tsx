interface Props {
  value: string;       // "HH:mm" 24-hour format
  onChange: (v: string) => void;
}

export function TimePicker({ value, onChange }: Props) {
  const parts = value.split(":");
  const h24 = isNaN(+parts[0]) ? 0 : +parts[0];
  const min  = isNaN(+parts[1]) ? 0 : +parts[1];

  const emit = (newH: number, newM: number) =>
    onChange(`${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}`);

  return (
    <div className="flex items-center gap-0.5 input-base py-1.5 px-2">
      <select
        value={h24}
        onChange={e => emit(+e.target.value, min)}
        className="bg-transparent focus:outline-none text-sm w-11 text-center"
      >
        {Array.from({ length: 24 }, (_, i) => i).map(h => (
          <option key={h} value={h}>{String(h).padStart(2, "0")}</option>
        ))}
      </select>
      <span className="text-gray-400 text-sm px-0.5">:</span>
      <select
        value={min}
        onChange={e => emit(h24, +e.target.value)}
        className="bg-transparent focus:outline-none text-sm w-12 text-center"
      >
        {Array.from({ length: 60 }, (_, i) => i).map(m => (
          <option key={m} value={m}>{String(m).padStart(2, "0")}</option>
        ))}
      </select>
    </div>
  );
}
