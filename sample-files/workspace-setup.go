package workspace

import (
	"fmt"
	"os"
	"path/filepath"
)

// Config holds workspace initialization settings.
type Config struct {
	Name     string
	DataDir  string
	MaxSizeGB int
}

// Init creates a new ClawDrive workspace directory structure.
func Init(cfg Config) error {
	dirs := []string{
		cfg.DataDir,
		filepath.Join(cfg.DataDir, "files"),
		filepath.Join(cfg.DataDir, "thumbnails"),
		filepath.Join(cfg.DataDir, "cache"),
	}

	for _, dir := range dirs {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return fmt.Errorf("creating %s: %w", dir, err)
		}
	}

	configPath := filepath.Join(cfg.DataDir, "workspace.json")
	if _, err := os.Stat(configPath); err == nil {
		return fmt.Errorf("workspace already exists at %s", cfg.DataDir)
	}

	return writeConfig(configPath, cfg)
}

func writeConfig(path string, cfg Config) error {
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()

	_, err = fmt.Fprintf(f, `{"name":%q,"max_size_gb":%d}`, cfg.Name, cfg.MaxSizeGB)
	return err
}
