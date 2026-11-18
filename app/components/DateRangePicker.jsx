import { useState, useCallback, useMemo } from "react";
import {
  Popover,
  Button,
  OptionList,
  DatePicker,
  Box,
  InlineStack,
  BlockStack,
  Divider,
  Text,
} from "@shopify/polaris";
import { CalendarIcon } from "@shopify/polaris-icons";
import { useSearchParams } from "react-router";

// YYYY-MM-DD in local time (avoids the UTC off-by-one that toISOString causes).
function toYMD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseYMD(s) {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

const PRESETS = [
  { label: "Today", value: "today" },
  { label: "Last 7 days", value: "7d" },
  { label: "Last 30 days", value: "30d" },
  { label: "Last 90 days", value: "90d" },
  { label: "Last 12 months", value: "12m" },
];

function presetRange(value) {
  const end = new Date();
  const start = new Date();
  switch (value) {
    case "today":
      break;
    case "7d":
      start.setDate(start.getDate() - 6);
      break;
    case "30d":
      start.setDate(start.getDate() - 29);
      break;
    case "90d":
      start.setDate(start.getDate() - 89);
      break;
    case "12m":
      start.setFullYear(start.getFullYear() - 1);
      break;
    default:
      start.setDate(start.getDate() - 29);
  }
  return { start, end };
}

function labelFor(startStr, endStr, presetValue) {
  const preset = PRESETS.find((p) => p.value === presetValue);
  if (preset) return preset.label;
  if (startStr && endStr) {
    const fmt = (s) =>
      parseYMD(s)?.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    return `${fmt(startStr)} – ${fmt(endStr)}`;
  }
  return "Last 30 days";
}

export default function DateRangePicker() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [open, setOpen] = useState(false);

  const startParam = searchParams.get("start");
  const endParam = searchParams.get("end");
  const presetParam = searchParams.get("preset") || (!startParam ? "30d" : null);

  // Working state for the custom-range calendar.
  const initialStart = parseYMD(startParam) || presetRange(presetParam || "30d").start;
  const initialEnd = parseYMD(endParam) || new Date();
  const [{ month, year }, setMonth] = useState({
    month: initialEnd.getMonth(),
    year: initialEnd.getFullYear(),
  });
  const [selected, setSelected] = useState({ start: initialStart, end: initialEnd });

  const toggle = useCallback(() => setOpen((o) => !o), []);
  const handleMonthChange = useCallback((m, y) => setMonth({ month: m, year: y }), []);

  const applyPreset = useCallback(
    (value) => {
      const next = new URLSearchParams(searchParams);
      next.set("preset", value);
      next.delete("start");
      next.delete("end");
      setSearchParams(next);
      setOpen(false);
    },
    [searchParams, setSearchParams],
  );

  const applyCustom = useCallback(() => {
    if (!selected.start || !selected.end) return;
    const next = new URLSearchParams(searchParams);
    next.set("start", toYMD(selected.start));
    next.set("end", toYMD(selected.end));
    next.delete("preset");
    setSearchParams(next);
    setOpen(false);
  }, [selected, searchParams, setSearchParams]);

  const buttonLabel = useMemo(
    () => labelFor(startParam, endParam, presetParam),
    [startParam, endParam, presetParam],
  );

  return (
    <Popover
      active={open}
      activator={
        <Button icon={CalendarIcon} disclosure onClick={toggle}>
          {buttonLabel}
        </Button>
      }
      onClose={toggle}
      preferredAlignment="right"
    >
      <Box padding="200" minWidth="340px">
        <InlineStack gap="400" align="start" blockAlign="start" wrap={false}>
          <Box minWidth="150px">
            <OptionList
              options={PRESETS}
              selected={presetParam ? [presetParam] : []}
              onChange={(vals) => vals[0] && applyPreset(vals[0])}
            />
          </Box>
          <Box>
            <BlockStack gap="200">
              <Text as="span" variant="headingSm">Custom range</Text>
              <DatePicker
                month={month}
                year={year}
                onChange={setSelected}
                onMonthChange={handleMonthChange}
                selected={selected}
                allowRange
                disableDatesAfter={new Date()}
              />
              <Divider />
              <InlineStack align="end">
                <Button variant="primary" onClick={applyCustom}>Apply</Button>
              </InlineStack>
            </BlockStack>
          </Box>
        </InlineStack>
      </Box>
    </Popover>
  );
}

// Loader helper: resolve searchParams into created_at_min / created_at_max ISO
// strings. Shared by the analytics routes so the picker and server agree.
export function resolveRange(url) {
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  const preset = url.searchParams.get("preset");

  if (start && end) {
    const s = parseYMD(start) || new Date();
    const e = parseYMD(end) || new Date();
    s.setHours(0, 0, 0, 0);
    e.setHours(23, 59, 59, 999);
    return { min: s, max: e };
  }

  const range = presetRange(preset || "30d");
  range.start.setHours(0, 0, 0, 0);
  range.end.setHours(23, 59, 59, 999);
  return { min: range.start, max: range.end };
}
