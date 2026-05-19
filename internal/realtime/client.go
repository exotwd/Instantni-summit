package realtime

type Client struct {
	ID   string
	Role string
	ch   chan Event
}

func (c *Client) Events() <-chan Event {
	return c.ch
}
