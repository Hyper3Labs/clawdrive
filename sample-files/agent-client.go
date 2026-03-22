package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// Client communicates with a ClawDrive instance via A2A protocol.
type Client struct {
	BaseURL    string
	AgentID    string
	HTTPClient *http.Client
}

// NewClient creates a new ClawDrive A2A client.
func NewClient(baseURL, agentID string) *Client {
	return &Client{
		BaseURL: baseURL,
		AgentID: agentID,
		HTTPClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// DiscoverFiles lists available files matching the given criteria.
func (c *Client) DiscoverFiles(ctx context.Context, fileType string, limit int) ([]FileInfo, error) {
	req := map[string]interface{}{
		"agent_id":  c.AgentID,
		"file_type": fileType,
		"limit":     limit,
	}

	body, _ := json.Marshal(req)
	httpReq, err := http.NewRequestWithContext(ctx, "POST", c.BaseURL+"/a2a/discover", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("creating request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.HTTPClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("discover request: %w", err)
	}
	defer resp.Body.Close()

	var result struct {
		Files []FileInfo `json:"files"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decoding response: %w", err)
	}

	return result.Files, nil
}

// FileInfo describes a file available in a ClawDrive instance.
type FileInfo struct {
	ID       string   `json:"id"`
	Name     string   `json:"name"`
	MIMEType string   `json:"mime_type"`
	Size     int64    `json:"size"`
	Tags     []string `json:"tags"`
}
