import React, { useState } from "react";
import {
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import Grid from "@mui/material/Grid";
import { useAsync } from "../useAsync";

export const KnowledgeBaseManager: React.FC = () => {
  const [filePath, setFilePath] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const documents = useAsync(() => window.customerAgent.invoke("knowledge.list", undefined), []);
  const [results, setResults] = useState<string[]>([]);

  const importFile = async () => {
    const result = await window.customerAgent.invoke("knowledge.import", { filePath, scope: "global" });
    setStatus(result.ok ? `已导入 ${result.document?.fileName}` : result.error ?? "导入失败");
    await documents.refresh();
  };

  const search = async () => {
    const response = await window.customerAgent.invoke("knowledge.search", { query });
    setResults(response.results.map((item) => item.content));
  };

  return (
    <Grid container spacing={2.5}>
      <Grid size={{ xs: 12, md: 4 }}>
        <Card variant="outlined" sx={{ height: "100%" }}>
          <CardContent>
            <Typography variant="h6">知识分区</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, mb: 2 }}>
              全局知识优先覆盖通用售前、售后和物流问题；店铺知识可做差异化补充。
            </Typography>
            <Divider sx={{ mb: 1 }} />
            <List>
              <ListItem disablePadding>
                <ListItemButton selected>
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <span className="material-symbols-outlined">folder</span>
                  </ListItemIcon>
                  <ListItemText primary="全局知识" secondary={`${documents.data?.documents.length ?? 0} 个文档`} />
                </ListItemButton>
              </ListItem>
              <ListItem disablePadding>
                <ListItemButton>
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <span className="material-symbols-outlined">store</span>
                  </ListItemIcon>
                  <ListItemText primary="店铺专属" secondary="按 shopId 过滤" />
                </ListItemButton>
              </ListItem>
            </List>
            <Button fullWidth variant="outlined" size="small" startIcon={<span className="material-symbols-outlined">refresh</span>} onClick={documents.refresh}>
              刷新索引
            </Button>
          </CardContent>
        </Card>
      </Grid>

      <Grid size={{ xs: 12, md: 8 }}>
        <Stack spacing={2.5}>
          <Card variant="outlined">
            <CardContent>
              <Stack direction={{ xs: "column", md: "row" }} spacing={1.25}>
                <TextField
                  fullWidth
                  label="搜索知识"
                  size="small"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                <Button variant="contained" size="small" onClick={search} startIcon={<span className="material-symbols-outlined">search</span>}>
                  检索
                </Button>
              </Stack>
              <Stack direction={{ xs: "column", md: "row" }} spacing={1.25} sx={{ mt: 2 }}>
                <TextField fullWidth size="small" label="本地文件路径" value={filePath} onChange={(event) => setFilePath(event.target.value)} />
                <Button variant="outlined" size="small" onClick={importFile} startIcon={<span className="material-symbols-outlined">upload</span>}>
                  导入
                </Button>
              </Stack>
              {status && <Typography sx={{ mt: 1.5 }} variant="body2" color={status.includes("失败") ? "error.main" : "success.main"}>{status}</Typography>}
            </CardContent>
          </Card>

          <Card variant="outlined">
            <CardContent>
              <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 2 }}>
                <Typography variant="h6">文档与命中片段</Typography>
                <Chip size="small" label={`${documents.data?.documents.length ?? 0} docs`} variant="outlined" />
              </Stack>
              <List sx={{ p: 0 }}>
                {(documents.data?.documents ?? []).map((document) => (
                  <ListItem key={document.id} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, mb: 1 }}>
                    <ListItemText
                      primary={document.fileName}
                      secondary={`${document.scope} · ${document.chunkCount} 个片段 · ${new Date(document.indexedAt).toLocaleString()}`}
                    />
                  </ListItem>
                ))}
                {(documents.data?.documents ?? []).length === 0 && <ListItem><ListItemText secondary="暂无导入文档。" /></ListItem>}
                {results.map((result, index) => (
                  <ListItem key={`${result}-${index}`} sx={{ bgcolor: "action.hover", borderRadius: 1, mb: 1 }}>
                    <ListItemText primary={`检索结果 ${index + 1}`} secondary={result} />
                  </ListItem>
                ))}
              </List>
            </CardContent>
          </Card>
        </Stack>
      </Grid>
    </Grid>
  );
};
