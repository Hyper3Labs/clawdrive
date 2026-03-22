package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
)

type SearchRequest struct {
	Query      string `json:"query"`
	MaxResults int    `json:"max_results,omitempty"`
	FileType   string `json:"file_type,omitempty"`
}

type SearchResult struct {
	ID       string  `json:"id"`
	Title    string  `json:"title"`
	Score    float64 `json:"score"`
	FileType string  `json:"file_type"`
	Snippet  string  `json:"snippet"`
}

type SearchResponse struct {
	Results   []SearchResult `json:"results"`
	Total     int            `json:"total"`
	LatencyMs int64          `json:"latency_ms"`
}

func SearchHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req SearchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if req.MaxResults == 0 {
		req.MaxResults = 10
	}

	// TODO: implement actual vector search
	resp := SearchResponse{
		Results:   []SearchResult{},
		Total:     0,
		LatencyMs: 0,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}
