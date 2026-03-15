package gitea

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
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

func (c *Client) CreateRepo(orgSlug, repoName string) (int64, string, string, error) {
	body := map[string]interface{}{
		"name":           repoName,
		"private":        true,
		"auto_init":      true,
		"default_branch": "main",
	}
	respBytes, status, err := c.do("POST", "/orgs/"+orgSlug+"/repos", body)
	if err != nil {
		return 0, "", "", err
	}
	if status != 201 {
		return 0, "", "", fmt.Errorf("gitea CreateRepo failed with status %d: %s", status, string(respBytes))
	}
	var repo struct {
		ID       int64  `json:"id"`
		CloneURL string `json:"clone_url"`
		HTMLURL  string `json:"html_url"`
	}
	if err := json.Unmarshal(respBytes, &repo); err != nil {
		return 0, "", "", err
	}
	if repo.HTMLURL == "" {
		repo.HTMLURL = strings.TrimSuffix(c.baseURL, "/") + "/" + orgSlug + "/" + repoName
	}
	if repo.CloneURL == "" {
		repo.CloneURL = strings.TrimSuffix(c.baseURL, "/") + "/" + orgSlug + "/" + repoName + ".git"
	}
	return repo.ID, repo.CloneURL, repo.HTMLURL, nil
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

// CreatePR creates a pull request in Gitea
func (c *Client) CreatePR(orgSlug, repoName string, title, body, head, base string) (int, error) {
	reqBody := map[string]interface{}{
		"title": title,
		"body":  body,
		"head":  head,
		"base":  base,
	}
	respBytes, status, err := c.do("POST", "/repos/"+orgSlug+"/"+repoName+"/pulls", reqBody)
	if err != nil {
		return 0, err
	}
	if status != 201 {
		return 0, fmt.Errorf("gitea CreatePR failed: %d %s", status, string(respBytes))
	}
	var pr struct {
		Number int `json:"number"`
	}
	json.Unmarshal(respBytes, &pr)
	return pr.Number, nil
}

// MergePR merges a pull request in Gitea (method: "merge" | "squash" | "rebase")
func (c *Client) MergePR(orgSlug, repoName string, prNumber int, method string) error {
	reqBody := map[string]interface{}{
		"do": method,
	}
	_, status, err := c.do("POST",
		fmt.Sprintf("/repos/%s/%s/pulls/%d/merge", orgSlug, repoName, prNumber), reqBody)
	if err != nil {
		return err
	}
	if status != 200 && status != 204 {
		return fmt.Errorf("gitea MergePR failed with status %d", status)
	}
	return nil
}

// GetPRDiff returns the unified diff for a pull request
func (c *Client) GetPRDiff(orgSlug, repoName string, prNumber int) (string, error) {
	respBytes, status, err := c.do("GET",
		fmt.Sprintf("/repos/%s/%s/pulls/%d.diff", orgSlug, repoName, prNumber), nil)
	if err != nil {
		return "", err
	}
	if status != 200 {
		return "", fmt.Errorf("gitea GetPRDiff failed: %d", status)
	}
	return string(respBytes), nil
}

// ClosePR closes a pull request without merging
func (c *Client) ClosePR(orgSlug, repoName string, prNumber int) error {
	reqBody := map[string]interface{}{
		"state": "closed",
	}
	_, status, err := c.do("PATCH",
		fmt.Sprintf("/repos/%s/%s/pulls/%d", orgSlug, repoName, prNumber), reqBody)
	if err != nil {
		return err
	}
	if status != 201 && status != 200 {
		return fmt.Errorf("gitea ClosePR failed: %d", status)
	}
	return nil
}

// GetBranches returns the list of branch names for a repo
func (c *Client) GetBranches(orgSlug, repoName string) ([]string, error) {
	respBytes, status, err := c.do("GET", "/repos/"+orgSlug+"/"+repoName+"/branches", nil)
	if err != nil {
		return nil, err
	}
	if status != 200 {
		return nil, fmt.Errorf("gitea GetBranches failed: %d", status)
	}
	var branches []struct {
		Name string `json:"name"`
	}
	json.Unmarshal(respBytes, &branches)
	names := make([]string, len(branches))
	for i, b := range branches {
		names[i] = b.Name
	}
	return names, nil
}