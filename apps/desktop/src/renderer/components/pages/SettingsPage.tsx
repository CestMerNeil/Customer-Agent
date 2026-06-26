import React, { useEffect, useState } from "react";
import { Box, Button, Card, CardContent, Stack, TextField, Typography } from "@mui/material";
import { tokens } from "../../theme";
import { FieldRow, InfoRow, SectionLabel } from "../SettingsKit";

const DATA_DIR = "~/Library/Application Support/Customer-Agent";

export const SettingsPage: React.FC = () => {
  const [businessStart, setBusinessStart] = useState("09:00");
  const [businessEnd, setBusinessEnd] = useState("21:00");
  const [handoffKeywords, setHandoffKeywords] = useState("");
  const [intentRules, setIntentRules] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void window.customerAgent.invoke("settings.get", undefined).then((response) => {
      if (response.settings.businessHours) {
        setBusinessStart(response.settings.businessHours.start);
        setBusinessEnd(response.settings.businessHours.end);
      }
      setHandoffKeywords(response.settings.handoff?.keywords.join("\n") ?? "");
      setIntentRules((response.settings.handoff?.intentRules ?? []).map((rule) => `${rule.label}:${rule.patterns.join("|")}`).join("\n"));
    });
  }, []);

  const saveSettings = async (nextStart: string, nextEnd: string, successMessage: string) => {
    await window.customerAgent.invoke("settings.save", {
      businessHours: { start: nextStart, end: nextEnd },
      handoff: {
        keywords: splitLines(handoffKeywords),
        intentRules: splitLines(intentRules).map(parseIntentRule),
      },
    });
    setMessage(successMessage);
  };

  const save = async () => {
    await saveSettings(businessStart, businessEnd, "设置已保存");
  };

  return (
    <Box sx={{ maxWidth: 720 }}>
      <Stack spacing={3}>
        <Box>
          <SectionLabel>人工转接</SectionLabel>
          <Card>
            <CardContent sx={{ px: 2.5, py: 1 }}>
              <FieldRow label="关键词">
                <TextField
                  fullWidth
                  multiline
                  minRows={3}
                  size="small"
                  value={handoffKeywords}
                  onChange={(event) => setHandoffKeywords(event.target.value)}
                  placeholder={"转人工\n投诉\nshop:232823523:人工客服"}
                  helperText="每行一条；删除一行即删除规则。店铺规则格式：shop:店铺ID:关键词。"
                />
              </FieldRow>
              <FieldRow label="意图规则" last>
                <TextField
                  fullWidth
                  multiline
                  minRows={3}
                  size="small"
                  value={intentRules}
                  onChange={(event) => setIntentRules(event.target.value)}
                  placeholder={"退款纠纷:退款|退货|售后\nshop:232823523:人工诉求:人工|客服|没人"}
                  helperText="每行一条；格式：意图名:触发词|触发词。店铺规则格式：shop:店铺ID:意图名:触发词|触发词。"
                />
              </FieldRow>
            </CardContent>
          </Card>
        </Box>

        <Box>
          <SectionLabel>营业时间</SectionLabel>
          <Card>
            <CardContent sx={{ px: 2.5, py: 1 }}>
              <FieldRow label="开始时间">
                <TextField
                  size="small"
                  type="time"
                  value={businessStart}
                  onChange={(event) => setBusinessStart(event.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                  sx={{ width: 140 }}
                />
              </FieldRow>
              <FieldRow label="结束时间" last>
                <TextField
                  size="small"
                  type="time"
                  value={businessEnd}
                  onChange={(event) => setBusinessEnd(event.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                  sx={{ width: 140 }}
                />
              </FieldRow>
            </CardContent>
          </Card>
        </Box>

        <Box>
          <SectionLabel>本地数据</SectionLabel>
          <Card>
            <CardContent sx={{ px: 2.5, py: 1 }}>
              <InfoRow
                label="数据目录"
                value={
                  <Typography variant="body2" sx={{ fontFamily: "ui-monospace, SFMono-Regular, monospace" }}>
                    {DATA_DIR}
                  </Typography>
                }
                last
              />
            </CardContent>
          </Card>
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Button variant="contained" onClick={save} startIcon={<span className="material-symbols-outlined">save</span>}>
            保存设置
          </Button>
          {message && (
            <Typography variant="body2" sx={{ color: tokens.color.state.success }}>
              {message}
            </Typography>
          )}
        </Box>
      </Stack>
    </Box>
  );
};

function splitLines(value: string): string[] {
  return value.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
}

function parseIntentRule(line: string, index: number) {
  const scoped = /^shop:([^:]+):(.+)$/u.exec(line);
  const source = scoped?.[2] ?? line;
  const [labelPart, patternsPart] = line.split(/[:：]/u);
  const [scopedLabelPart, scopedPatternsPart] = source.split(/[:：]/u);
  const labelSource = scoped ? scopedLabelPart : labelPart;
  const patternsSource = scoped ? scopedPatternsPart : patternsPart;
  const label = (patternsSource ? labelSource : `规则 ${index + 1}`)?.trim() || `规则 ${index + 1}`;
  const patterns = (patternsSource ?? labelSource ?? "").split("|").map((item) => item.trim()).filter(Boolean);
  return { id: `intent-${index + 1}`, label, patterns, ...(scoped?.[1] ? { shopId: scoped[1] } : {}) };
}
