import React, { useState } from "react";
import { Box, Button, Card, CardContent, Divider, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Typography, TextField, Stack } from "@mui/material";
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
    <Box>
      <Grid container spacing={3}>
        {/* Left: Category Tree/List */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Card variant="outlined" sx={{ height: "100%" }}>
            <CardContent>
              <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: "bold" }}>
                知识库分类
              </Typography>
              <Divider sx={{ mb: 1 }} />
              <List>
                <ListItem disablePadding>
                  <ListItemButton selected>
                    <ListItemIcon sx={{ minWidth: 32 }}>
                      <span className="material-symbols-outlined">folder</span>
                    </ListItemIcon>
                    <ListItemText primary="全局知识" />
                  </ListItemButton>
                </ListItem>
                <ListItem disablePadding>
                  <ListItemButton>
                    <ListItemIcon sx={{ minWidth: 32 }}>
                      <span className="material-symbols-outlined">store</span>
                    </ListItemIcon>
                    <ListItemText primary="店铺 A 专属" />
                  </ListItemButton>
                </ListItem>
              </List>
                <Button fullWidth variant="text" size="small" startIcon={<span className="material-symbols-outlined">refresh</span>} onClick={documents.refresh}>
                刷新
              </Button>
            </CardContent>
          </Card>
        </Grid>

        {/* Right: Content List */}
        <Grid size={{ xs: 12, md: 8 }}>
          <Card variant="outlined">
            <CardContent>
              <Box sx={{ mb: 2, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1 }}>
                <TextField
                  placeholder="搜索知识..."
                  size="small"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  sx={{ width: 240 }}
                />
                <Button variant="outlined" size="small" onClick={search}>检索</Button>
              </Box>
              <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
                <TextField fullWidth size="small" label="本地文件路径" value={filePath} onChange={(event) => setFilePath(event.target.value)} />
                <Button variant="contained" size="small" onClick={importFile} startIcon={<span className="material-symbols-outlined">upload</span>}>
                  导入
                </Button>
              </Stack>
              {status && <Typography sx={{ mb: 2 }} variant="body2">{status}</Typography>}
              <Divider sx={{ mb: 2 }} />
              <List>
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
        </Grid>
      </Grid>
    </Box>
  );
};
