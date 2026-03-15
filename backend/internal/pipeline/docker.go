package pipeline

import (
	"bufio"
	"fmt"
	"os/exec"
	"strings"
)

// RunContainer runs a Docker container and streams logs line-by-line via logCallback.
// Returns the container exit code.
func RunContainer(
	image string,
	cmd string,
	workdir string,
	envVars map[string]string,
	logCallback func(line string),
) (int, error) {
	args := []string{
		"run", "--rm",
		"--network", "none",
		"-w", "/workspace",
		"-v", workdir + ":/workspace",
		"-v", "/var/run/docker.sock:/var/run/docker.sock",
	}

	for k, v := range envVars {
		args = append(args, "-e", k+"="+v)
	}

	args = append(args,
		"--memory", "512m",
		"--cpus", "1.0",
	)

	args = append(args, image, "sh", "-c", cmd)

	dockerCmd := exec.Command("docker", args...)

	stdout, err := dockerCmd.StdoutPipe()
	if err != nil {
		return -1, err
	}
	dockerCmd.Stderr = dockerCmd.Stdout

	if err := dockerCmd.Start(); err != nil {
		return -1, fmt.Errorf("failed to start container: %w", err)
	}

	scanner := bufio.NewScanner(stdout)
	for scanner.Scan() {
		logCallback(scanner.Text())
	}

	if err := dockerCmd.Wait(); err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			return exitErr.ExitCode(), nil
		}
		return -1, err
	}
	return 0, nil
}

// PullImage pulls a Docker image (no-op if already present locally).
func PullImage(image string) error {
	cmd := exec.Command("docker", "pull", image)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("docker pull %s failed: %s", image, string(output))
	}
	return nil
}

// CloneRepo clones a git repository at a specific commit into destDir.
func CloneRepo(cloneURL, commitSHA, destDir string) error {
	cloneCmd := exec.Command("git", "clone", "--depth", "50", cloneURL, destDir)
	if out, err := cloneCmd.CombinedOutput(); err != nil {
		return fmt.Errorf("git clone failed: %s", string(out))
	}

	if commitSHA != "" && commitSHA != "0000000000000000000000000000000000000000" {
		checkoutCmd := exec.Command("git", "-C", destDir, "checkout", commitSHA)
		// Non-fatal — shallow clone may not have the exact commit
		_ = checkoutCmd.Run()
	}
	return nil
}

// RemoveDir removes a directory and all its contents.
func RemoveDir(dir string) {
	exec.Command("rm", "-rf", dir).Run()
}

// ─────────────────────────────────────────────────────
// Container management helpers (used by deployments API)
// ─────────────────────────────────────────────────────

// ContainerInfo holds info about a Docker container.
type ContainerInfo struct {
	ID     string
	Name   string
	Status string
	Image  string
}

// CreateContainer creates a named Docker container without starting it.
// The container name in Docker is always: devora-{name}.
func CreateContainer(
	name string,
	image string,
	hostPort int,
	internalPort int,
	envVars map[string]string,
) (string, error) {
	args := []string{
		"create",
		"--name", "devora-" + name,
		"-p", fmt.Sprintf("%d:%d", hostPort, internalPort),
		"--restart", "unless-stopped",
	}
	for k, v := range envVars {
		args = append(args, "-e", k+"="+v)
	}
	args = append(args, image)

	cmd := exec.Command("docker", args...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("docker create failed: %s", string(out))
	}
	return strings.TrimSpace(string(out)), nil
}

// StartContainer starts an existing container by ID or name.
func StartContainer(dockerID string) error {
	cmd := exec.Command("docker", "start", dockerID)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("docker start failed: %s", string(out))
	}
	return nil
}

// StopContainer stops a running container with a 10-second grace period.
func StopContainer(dockerID string) error {
	cmd := exec.Command("docker", "stop", "-t", "10", dockerID)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("docker stop failed: %s", string(out))
	}
	return nil
}

// RemoveContainer force-removes a container (stopped or running).
func RemoveContainer(dockerID string) error {
	cmd := exec.Command("docker", "rm", "-f", dockerID)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("docker rm failed: %s", string(out))
	}
	return nil
}

// GetContainerStatus returns the current runtime status of a container.
// Returns "running", "stopped", or "not found".
func GetContainerStatus(dockerID string) string {
	cmd := exec.Command("docker", "inspect",
		"--format", "{{.State.Status}}", dockerID)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return "not found"
	}
	status := strings.TrimSpace(string(out))
	switch status {
	case "running":
		return "running"
	case "exited", "dead":
		return "stopped"
	default:
		return status
	}
}

// StreamContainerLogs streams live container logs via callback.
// Stops when the done channel is closed (e.g. request context cancelled).
func StreamContainerLogs(
	dockerID string,
	callback func(line string),
	done <-chan struct{},
) {
	cmd := exec.Command("docker", "logs",
		"--follow", "--tail", "100", dockerID)

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		callback("ERROR: " + err.Error())
		return
	}
	cmd.Stderr = cmd.Stdout

	if err := cmd.Start(); err != nil {
		callback("ERROR: " + err.Error())
		return
	}

	go func() {
		<-done
		cmd.Process.Kill()
	}()

	scanner := bufio.NewScanner(stdout)
	for scanner.Scan() {
		callback(scanner.Text())
	}
	cmd.Wait()
}

// ExecInContainer runs a command inside a running container
// and returns combined stdout+stderr output.
func ExecInContainer(
	containerName string,
	command string,
) (string, error) {
	cmd := exec.Command("docker", "exec", containerName, "sh", "-c", command)
	out, err := cmd.CombinedOutput()
	return strings.TrimSpace(string(out)), err
}

// ExecInContainerWithEnv runs a command with env vars.
func ExecInContainerWithEnv(
	containerName string,
	command string,
	env map[string]string,
) (string, error) {
	args := []string{"exec"}
	for k, v := range env {
		args = append(args, "-e", k+"="+v)
	}
	args = append(args, containerName, "sh", "-c", command)
	cmd := exec.Command("docker", args...)
	out, err := cmd.CombinedOutput()
	return strings.TrimSpace(string(out)), err
}
