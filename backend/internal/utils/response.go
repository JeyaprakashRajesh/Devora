package utils

import "github.com/gin-gonic/gin"

func OK(c *gin.Context, data interface{})      { c.JSON(200, gin.H{"data": data}) }
func Created(c *gin.Context, data interface{}) { c.JSON(201, gin.H{"data": data}) }
func BadRequest(c *gin.Context, msg string)    { c.JSON(400, gin.H{"error": msg}) }
func Unauthorized(c *gin.Context)              { c.JSON(401, gin.H{"error": "Unauthorized"}) }
func Forbidden(c *gin.Context)                 { c.JSON(403, gin.H{"error": "Forbidden"}) }
func NotFound(c *gin.Context, msg string)      { c.JSON(404, gin.H{"error": msg}) }
func Conflict(c *gin.Context, msg string)      { c.JSON(409, gin.H{"error": msg}) }
func InternalError(c *gin.Context, err error)  { c.JSON(500, gin.H{"error": "Internal server error"}) }
