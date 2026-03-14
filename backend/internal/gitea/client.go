package gitea

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
)

type Client struct {
	baseURL  string
	username string
	password string
	http     *http.Client
}

var Default *Client

func Init() {
	Default = &Client{
		baseURL:  os.Getenv("GITEA_URL"),
		username: os.Getenv("GITEA_ADMIN_USER"),
		password: os.Getenv("GITEA_ADMIN_PASSWORD"),
		http:     &http.Client{},
	}
}

func (c *Client) do(method, path string, body interface{}) ([]byte, int, error) {
	var reqBody io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, 0, err
		}
		reqBody = bytes.NewBuffer(b)
	}

	req, err := http.NewRequestWithContext(
		context.Background(),
		method,
		c.baseURL+"/api/v1"+path,
		reqBody,
	)
	if err != nil {
		return nil, 0, err
	}

	req.SetBasicAuth(c.username, c.password)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	return respBody, resp.StatusCode, err
}

func (c *Client) CreateOrg(slug, name string) error {
	body := map[string]interface{}{
		"username":   slug,
		"full_name":  name,
		"visibility": "private",
	}
	_, status, err := c.do("POST", "/orgs", body)
	if err != nil {
		return err
	}
	if status != 201 && status != 422 {
		return fmt.Errorf("gitea CreateOrg failed with status %d", status)
	}
	return nil
}

func (c *Client) CreateRepo(orgSlug, repoName string) (int64, string, error) {
	body := map[string]interface{}{
		"name":           repoName,
		"private":        true,
		"auto_init":      true,
		"default_branch": "main",
	}
	respBytes, status, err := c.do("POST", "/orgs/"+orgSlug+"/repos", body)
	if err != nil {
		return 0, "", err
	}
	if status != 201 {
		return 0, "", fmt.Errorf("gitea CreateRepo failed with status %d: %s", status, string(respBytes))
	}
	var repo struct {
		ID       int64  `json:"id"`
		CloneURL string `json:"clone_url"`
	}
	if err := json.Unmarshal(respBytes, &repo); err != nil {
		return 0, "", err
	}
	return repo.ID, repo.CloneURL, nil
}

func (c *Client) CreateWebhook(orgSlug, repoName, webhookURL string) error {
	body := map[string]interface{}{
		"type": "gitea",
		"config": map[string]string{
			"url":          webhookURL,
			"content_type": "json",
			"secret":       os.Getenv("WEBHOOK_SECRET"),
		},
		"events": []string{"push", "pull_request"},
		"active": true,
	}
	_, status, err := c.do("POST", "/repos/"+orgSlug+"/"+repoName+"/hooks", body)
	if err != nil {
		return err
	}
	if status != 201 {
		return fmt.Errorf("gitea CreateWebhook failed with status %d", status)
	}
	return nil
}

func (c *Client) DeleteRepo(orgSlug, repoName string) error {
	_, status, err := c.do("DELETE", "/repos/"+orgSlug+"/"+repoName, nil)
	if err != nil {
		return err
	}
	if status != 204 && status != 404 {
		return fmt.Errorf("gitea DeleteRepo failed with status %d", status)
	}
	return nil
}

func (c *Client) GetRepoInfo(orgSlug, repoName string) (map[string]interface{}, error) {
	respBytes, status, err := c.do("GET", "/repos/"+orgSlug+"/"+repoName, nil)
	if err != nil {
		return nil, err
	}
	if status != 200 {
		return nil, fmt.Errorf("repo not found")
	}
	var result map[string]interface{}
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return nil, err
	}
	return result, nil
}